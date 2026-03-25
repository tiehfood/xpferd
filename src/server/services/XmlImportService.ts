/**
 * XmlImportService — parses XRechnung XML into an InvoiceDto.
 *
 * Supports two formats:
 *  • UBL 2.1  (root element: Invoice / ubl:Invoice)
 *  • CII      (root element: rsm:CrossIndustryInvoice — ZUGFeRD / Factur-X)
 *
 * This service does NOT save to the database. The caller is responsible for
 * deciding whether to persist the returned InvoiceDto.
 *
 * Parsing uses xmlbuilder2's convert() function which transforms an XML string
 * into a nested JS object. Key behavioural notes:
 *  • Element with text only:  { 'cbc:ID': 'RE-001' }
 *  • Element with attributes: { 'cbc:InvoicedQuantity': { '@unitCode': 'DAY', '#': '5' } }
 *  • Namespace prefixes are preserved in keys (cbc:, cac:, ram:, udt:, etc.)
 *  • A single child keeps its object shape; multiple siblings become an array
 */

import { convert } from 'xmlbuilder2';
import type { InvoiceDto, InvoiceLineDto } from '../../shared/types/Invoice.js';

// ---------------------------------------------------------------------------
// Internal helper functions
// ---------------------------------------------------------------------------

/**
 * Extract text content from an xmlbuilder2 node.
 * Handles: plain string, number, object with '#' (text + attributes),
 * object with '#text' (older style), and null/undefined.
 */
function text(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (typeof node === 'object') {
    const n = node as Record<string, unknown>;
    // xmlbuilder2 uses '#' when the element has both attributes and text content
    if ('#' in n) return String(n['#']);
    // Fallback: some older serialisations use '#text'
    if ('#text' in n) return String(n['#text']);
  }
  return '';
}

/**
 * Extract an XML attribute value from an xmlbuilder2 node.
 * Attributes are stored as '@attrName' keys in the object.
 */
function attr(node: unknown, name: string): string {
  if (node == null || typeof node !== 'object') return '';
  const n = node as Record<string, unknown>;
  const key = `@${name}`;
  return n[key] != null ? String(n[key]) : '';
}

/**
 * Normalise a value that may be a single element (object) or an array of
 * elements into an array. xmlbuilder2 only produces arrays for repeated
 * sibling elements with the same tag name.
 */
function asArray(val: unknown): unknown[] {
  if (val == null) return [];
  return Array.isArray(val) ? val : [val];
}

/**
 * Parse a CII date node in format 102 (YYYYMMDD) to an ISO 8601 date string
 * (YYYY-MM-DD). Passes through any other string unchanged as a safe fallback.
 */
function parseCiiDate(node: unknown): string {
  const raw = text(node);
  if (raw.length === 8) {
    return `${raw.substring(0, 4)}-${raw.substring(4, 6)}-${raw.substring(6, 8)}`;
  }
  return raw; // pass-through for already ISO-formatted dates or empty string
}

/** Return `s` when it is a non-empty string, otherwise `undefined`. */
function orUndef(s: string): string | undefined {
  return s !== '' ? s : undefined;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class XmlImportService {
  /**
   * Parse an XML string (auto-detects UBL 2.1 vs CII/ZUGFeRD) and return a
   * populated InvoiceDto.
   *
   * The returned DTO is NOT saved to the database — the caller decides whether
   * to persist it via InvoiceService.
   *
   * @throws Error when the XML is malformed or the root format is unrecognised.
   */
  parse(xml: string): InvoiceDto {
    let obj: unknown;
    try {
      obj = convert(xml, { format: 'object' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(`Ungültiges XML: ${msg}`);
    }

    if (obj == null || typeof obj !== 'object') {
      throw new Error('Ungültiges XML: leeres Dokument');
    }

    const format = this.detectFormat(obj as Record<string, unknown>);
    if (format === 'ubl') return this.parseUbl(obj as Record<string, unknown>);
    return this.parseCii(obj as Record<string, unknown>);
  }

  // ---------------------------------------------------------------------------
  // Format detection
  // ---------------------------------------------------------------------------

  private detectFormat(obj: Record<string, unknown>): 'ubl' | 'cii' {
    const keys = Object.keys(obj);
    // UBL 2.1 Invoice — with or without a namespace prefix
    if (keys.some(k => k === 'Invoice' || k.endsWith(':Invoice'))) return 'ubl';
    // CII / ZUGFeRD — rsm:CrossIndustryInvoice (or similar prefixes)
    if (keys.some(k => k.includes('CrossIndustryInvoice'))) return 'cii';
    throw new Error(
      'Unbekanntes XML-Format: Weder UBL 2.1 (Invoice) noch CII (CrossIndustryInvoice) erkannt',
    );
  }

  // ---------------------------------------------------------------------------
  // UBL 2.1 parser
  // ---------------------------------------------------------------------------

  private parseUbl(obj: Record<string, unknown>): InvoiceDto {
    // Root element may be 'Invoice' or 'ubl:Invoice' or any other prefix
    const rootKey = Object.keys(obj).find(k => k === 'Invoice' || k.endsWith(':Invoice'))!;
    const inv = obj[rootKey] as Record<string, unknown>;

    // ------------------------------------------------------------------
    // Header fields
    // ------------------------------------------------------------------
    const invoiceNumber =
      text(inv['cbc:ID']) || `IMPORT-${Date.now()}`;
    const invoiceDate =
      text(inv['cbc:IssueDate']) || new Date().toISOString().slice(0, 10);
    const dueDate = orUndef(text(inv['cbc:DueDate']));
    const invoiceTypeCode = text(inv['cbc:InvoiceTypeCode']) || '380';
    const currencyCode = text(inv['cbc:DocumentCurrencyCode']) || 'EUR';
    const buyerReference = text(inv['cbc:BuyerReference']) || '';
    const note = orUndef(text(inv['cbc:Note']));

    // BT-13 Order reference
    const orderRefNode = inv['cac:OrderReference'] as Record<string, unknown> | undefined;
    const orderReference = orderRefNode
      ? orUndef(text(orderRefNode['cbc:ID']))
      : undefined;

    // BT-12 Contract reference
    const contractRefNode = inv['cac:ContractDocumentReference'] as Record<string, unknown> | undefined;
    const contractReference = contractRefNode
      ? orUndef(text(contractRefNode['cbc:ID']))
      : undefined;

    // BT-72 Delivery date
    const deliveryNode = inv['cac:Delivery'] as Record<string, unknown> | undefined;
    const deliveryDate = deliveryNode
      ? orUndef(text(deliveryNode['cbc:ActualDeliveryDate']))
      : undefined;

    // ------------------------------------------------------------------
    // Seller (BG-4)
    // ------------------------------------------------------------------
    const supplierPartyOuter = inv['cac:AccountingSupplierParty'] as Record<string, unknown> | undefined;
    const supplierParty = (supplierPartyOuter?.['cac:Party'] ?? {}) as Record<string, unknown>;

    const sellerLegalEntity = supplierParty['cac:PartyLegalEntity'] as Record<string, unknown> | undefined;
    const sellerPartyName = supplierParty['cac:PartyName'] as Record<string, unknown> | undefined;
    const sellerName =
      text(sellerLegalEntity?.['cbc:RegistrationName']) ||
      text(sellerPartyName?.['cbc:Name']) ||
      'Unbekannt';

    const sellerAddress = supplierParty['cac:PostalAddress'] as Record<string, unknown> | undefined;
    const sellerCountry = sellerAddress?.['cac:Country'] as Record<string, unknown> | undefined;

    let sellerVatId: string | undefined;
    let sellerTaxNumber: string | undefined;

    for (const taxSchemeEntry of asArray(supplierParty['cac:PartyTaxScheme'])) {
      const entry = taxSchemeEntry as Record<string, unknown>;
      const schemeId = text(
        (entry['cac:TaxScheme'] as Record<string, unknown> | undefined)?.['cbc:ID'],
      );
      const companyId = text(entry['cbc:CompanyID']);
      if (schemeId === 'VAT') sellerVatId = orUndef(companyId);
      if (schemeId === 'FC') sellerTaxNumber = orUndef(companyId);
    }

    const sellerContact = supplierParty['cac:Contact'] as Record<string, unknown> | undefined;

    // ------------------------------------------------------------------
    // Buyer (BG-7)
    // ------------------------------------------------------------------
    const customerPartyOuter = inv['cac:AccountingCustomerParty'] as Record<string, unknown> | undefined;
    const customerParty = (customerPartyOuter?.['cac:Party'] ?? {}) as Record<string, unknown>;

    const buyerLegalEntity = customerParty['cac:PartyLegalEntity'] as Record<string, unknown> | undefined;
    const buyerPartyName = customerParty['cac:PartyName'] as Record<string, unknown> | undefined;
    const buyerName =
      text(buyerLegalEntity?.['cbc:RegistrationName']) ||
      text(buyerPartyName?.['cbc:Name']) ||
      'Unbekannt';

    const buyerAddress = customerParty['cac:PostalAddress'] as Record<string, unknown> | undefined;
    const buyerCountry = buyerAddress?.['cac:Country'] as Record<string, unknown> | undefined;

    let buyerVatId: string | undefined;
    for (const taxSchemeEntry of asArray(customerParty['cac:PartyTaxScheme'])) {
      const entry = taxSchemeEntry as Record<string, unknown>;
      const schemeId = text(
        (entry['cac:TaxScheme'] as Record<string, unknown> | undefined)?.['cbc:ID'],
      );
      const companyId = text(entry['cbc:CompanyID']);
      if (schemeId === 'VAT') buyerVatId = orUndef(companyId);
    }

    // Buyer email: EndpointID where @schemeID = 'EM', else Contact/ElectronicMail
    let buyerEmail: string | undefined;
    const endpointId = customerParty['cbc:EndpointID'] as unknown;
    if (endpointId != null) {
      if (attr(endpointId, 'schemeID') === 'EM') {
        buyerEmail = orUndef(text(endpointId));
      }
    }
    if (!buyerEmail) {
      const buyerContact = customerParty['cac:Contact'] as Record<string, unknown> | undefined;
      buyerEmail = orUndef(text(buyerContact?.['cbc:ElectronicMail']));
    }

    // ------------------------------------------------------------------
    // Payment (BG-16)
    // ------------------------------------------------------------------
    const payMeans = inv['cac:PaymentMeans'] as Record<string, unknown> | undefined;
    const paymentMeansCode = text(payMeans?.['cbc:PaymentMeansCode']) || '58';
    const paymentReference = orUndef(text(payMeans?.['cbc:PaymentID']));

    const payeeAccount = payMeans?.['cac:PayeeFinancialAccount'] as Record<string, unknown> | undefined;
    const iban = orUndef(text(payeeAccount?.['cbc:ID']));
    const accountName = orUndef(text(payeeAccount?.['cbc:Name']));

    // BIC may be directly in FinancialInstitutionBranch as cbc:ID or nested
    const fib = payeeAccount?.['cac:FinancialInstitutionBranch'] as Record<string, unknown> | undefined;
    const fibInstitution = fib?.['cac:FinancialInstitution'] as Record<string, unknown> | undefined;
    const bic = orUndef(text(fib?.['cbc:ID']) || text(fibInstitution?.['cbc:ID']));

    const paymentTerms = orUndef(
      text((inv['cac:PaymentTerms'] as Record<string, unknown> | undefined)?.['cbc:Note']),
    );

    // ------------------------------------------------------------------
    // Tax (BG-23) — use first TaxSubtotal for header-level tax rate
    // ------------------------------------------------------------------
    const taxTotal = inv['cac:TaxTotal'] as Record<string, unknown> | undefined;
    const taxSubtotals = asArray(taxTotal?.['cac:TaxSubtotal']);
    const firstSub = taxSubtotals[0] as Record<string, unknown> | undefined;
    const taxCategoryNode = firstSub?.['cac:TaxCategory'] as Record<string, unknown> | undefined;
    const taxCategoryCode = text(taxCategoryNode?.['cbc:ID']) || 'S';
    const taxRate = parseFloat(text(taxCategoryNode?.['cbc:Percent'])) || 0;
    const totalTaxAmount = parseFloat(text(taxTotal?.['cbc:TaxAmount'])) || 0;

    // ------------------------------------------------------------------
    // Kleinunternehmer detection (§19 UStG, VAT category E + §19 in note)
    // ------------------------------------------------------------------
    const kleinunternehmer =
      taxCategoryCode === 'E' && taxRate === 0 && (note ?? '').includes('§19');

    // ------------------------------------------------------------------
    // Monetary totals (BG-22)
    // ------------------------------------------------------------------
    const monetary = inv['cac:LegalMonetaryTotal'] as Record<string, unknown> | undefined;
    const totalNetAmount = parseFloat(text(monetary?.['cbc:LineExtensionAmount'])) || undefined;
    const totalGrossAmount = parseFloat(text(monetary?.['cbc:TaxInclusiveAmount'])) || undefined;
    const amountDue = parseFloat(text(monetary?.['cbc:PayableAmount'])) || undefined;
    const prepaidRaw = parseFloat(text(monetary?.['cbc:PrepaidAmount']));
    const prepaidAmount = !isNaN(prepaidRaw) && prepaidRaw > 0 ? prepaidRaw : undefined;

    // ------------------------------------------------------------------
    // Line items (BG-25)
    // ------------------------------------------------------------------
    const lines: InvoiceLineDto[] = asArray(inv['cac:InvoiceLine']).map(
      (lineRaw: unknown, idx: number) => {
        const line = lineRaw as Record<string, unknown>;
        const item = line['cac:Item'] as Record<string, unknown> | undefined;

        // ClassifiedTaxCategory may omit the cac: prefix in some files
        const taxCat = (item?.['cac:ClassifiedTaxCategory'] ??
          item?.['ClassifiedTaxCategory']) as Record<string, unknown> | undefined;

        const qty = line['cbc:InvoicedQuantity'];
        const price = line['cac:Price'] as Record<string, unknown> | undefined;

        const lineVatCategoryCode = text(taxCat?.['cbc:ID']) || taxCategoryCode;
        const lineVatRateRaw = parseFloat(text(taxCat?.['cbc:Percent']));
        const lineVatRate = isNaN(lineVatRateRaw) ? taxRate : lineVatRateRaw;

        return {
          lineNumber: parseInt(text(line['cbc:ID']), 10) || idx + 1,
          quantity: parseFloat(text(qty)) || 1,
          unitCode: attr(qty, 'unitCode') || 'C62',
          itemName: text(item?.['cbc:Name']) || '',
          itemDescription: orUndef(text(item?.['cbc:Description'])),
          netPrice: parseFloat(text(price?.['cbc:PriceAmount'])) || 0,
          vatCategoryCode: lineVatCategoryCode,
          vatRate: lineVatRate,
          lineNetAmount: parseFloat(text(line['cbc:LineExtensionAmount'])) || 0,
        } satisfies InvoiceLineDto;
      },
    );

    // ------------------------------------------------------------------
    // Assemble InvoiceDto
    // ------------------------------------------------------------------
    return {
      invoiceNumber,
      invoiceDate,
      invoiceTypeCode,
      currencyCode,
      dueDate,
      buyerReference,
      note,
      deliveryDate,
      orderReference,
      contractReference,

      seller: {
        name: sellerName,
        street: text(sellerAddress?.['cbc:StreetName']) || '',
        city: text(sellerAddress?.['cbc:CityName']) || '',
        postalCode: text(sellerAddress?.['cbc:PostalZone']) || '',
        countryCode: text(sellerCountry?.['cbc:IdentificationCode']) || 'DE',
        vatId: sellerVatId,
        taxNumber: sellerTaxNumber,
        contactName: orUndef(text(sellerContact?.['cbc:Name'])),
        contactPhone: orUndef(text(sellerContact?.['cbc:Telephone'])),
        contactEmail: orUndef(text(sellerContact?.['cbc:ElectronicMail'])),
      },

      buyer: {
        name: buyerName,
        street: text(buyerAddress?.['cbc:StreetName']) || '',
        city: text(buyerAddress?.['cbc:CityName']) || '',
        postalCode: text(buyerAddress?.['cbc:PostalZone']) || '',
        countryCode: text(buyerCountry?.['cbc:IdentificationCode']) || 'DE',
        vatId: buyerVatId,
        email: buyerEmail,
      },

      paymentMeansCode,
      paymentTerms,
      iban,
      bic,
      paymentReference,
      accountName,

      taxCategoryCode,
      taxRate,
      kleinunternehmer,

      totalNetAmount,
      totalTaxAmount: totalTaxAmount || undefined,
      totalGrossAmount,
      amountDue,
      prepaidAmount,

      lines,
    };
  }

  // ---------------------------------------------------------------------------
  // CII / ZUGFeRD parser
  // ---------------------------------------------------------------------------

  private parseCii(obj: Record<string, unknown>): InvoiceDto {
    const rootKey = Object.keys(obj).find(k => k.includes('CrossIndustryInvoice'))!;
    const root = obj[rootKey] as Record<string, unknown>;

    const exchangedDoc = root['rsm:ExchangedDocument'] as Record<string, unknown> | undefined;
    const transaction = root['rsm:SupplyChainTradeTransaction'] as Record<string, unknown> | undefined;
    const agreement = transaction?.['ram:ApplicableHeaderTradeAgreement'] as Record<string, unknown> | undefined;
    const delivery = transaction?.['ram:ApplicableHeaderTradeDelivery'] as Record<string, unknown> | undefined;
    const settlement = transaction?.['ram:ApplicableHeaderTradeSettlement'] as Record<string, unknown> | undefined;

    // ------------------------------------------------------------------
    // Header fields
    // ------------------------------------------------------------------
    const invoiceNumber = text(exchangedDoc?.['ram:ID']) || `IMPORT-${Date.now()}`;
    const invoiceTypeCode = text(exchangedDoc?.['ram:TypeCode']) || '380';

    const issueDateNode = exchangedDoc?.['ram:IssueDateTime'] as Record<string, unknown> | undefined;
    const invoiceDate =
      parseCiiDate(issueDateNode?.['udt:DateTimeString']) ||
      new Date().toISOString().slice(0, 10);

    const currencyCode = text(settlement?.['ram:InvoiceCurrencyCode']) || 'EUR';
    const buyerReference = text(agreement?.['ram:BuyerReference']) || '';

    // Notes: may be multiple IncludedNote elements
    const notes = asArray(exchangedDoc?.['ram:IncludedNote'])
      .map((n: unknown) => text((n as Record<string, unknown>)['ram:Content']))
      .filter(Boolean);
    const note = notes.length > 0 ? notes.join('\n') : undefined;

    // BT-13 Order reference
    const buyerOrderDoc = agreement?.['ram:BuyerOrderReferencedDocument'] as Record<string, unknown> | undefined;
    const orderReference = orUndef(text(buyerOrderDoc?.['ram:IssuerAssignedID']));

    // BT-12 Contract reference
    const contractDoc = agreement?.['ram:ContractReferencedDocument'] as Record<string, unknown> | undefined;
    const contractReference = orUndef(text(contractDoc?.['ram:IssuerAssignedID']));

    // BT-72 Delivery date
    const actualDelivery = delivery?.['ram:ActualDeliverySupplyChainEvent'] as Record<string, unknown> | undefined;
    const deliveryDateTime = actualDelivery?.['ram:OccurrenceDateTime'] as Record<string, unknown> | undefined;
    const deliveryDate = deliveryDateTime
      ? orUndef(parseCiiDate(deliveryDateTime['udt:DateTimeString']))
      : undefined;

    // ------------------------------------------------------------------
    // Seller (BG-4)
    // ------------------------------------------------------------------
    const sellerParty = agreement?.['ram:SellerTradeParty'] as Record<string, unknown> | undefined;
    const sellerName = text(sellerParty?.['ram:Name']) || 'Unbekannt';

    const sellerAddress = sellerParty?.['ram:PostalTradeAddress'] as Record<string, unknown> | undefined;

    let sellerVatId: string | undefined;
    let sellerTaxNumber: string | undefined;

    for (const reg of asArray(sellerParty?.['ram:SpecifiedTaxRegistration'])) {
      const entry = reg as Record<string, unknown>;
      const schemeId = attr(entry['ram:ID'], 'schemeID');
      const value = text(entry['ram:ID']);
      if (schemeId === 'VA') sellerVatId = orUndef(value);
      if (schemeId === 'FC') sellerTaxNumber = orUndef(value);
    }

    const sellerContact = sellerParty?.['ram:DefinedTradeContact'] as Record<string, unknown> | undefined;
    const sellerPhone = sellerContact?.['ram:TelephoneUniversalCommunication'] as Record<string, unknown> | undefined;
    const sellerEmailComm = sellerContact?.['ram:EmailURIUniversalCommunication'] as Record<string, unknown> | undefined;

    // ------------------------------------------------------------------
    // Buyer (BG-7)
    // ------------------------------------------------------------------
    const buyerParty = agreement?.['ram:BuyerTradeParty'] as Record<string, unknown> | undefined;
    const buyerName = text(buyerParty?.['ram:Name']) || 'Unbekannt';

    const buyerAddress = buyerParty?.['ram:PostalTradeAddress'] as Record<string, unknown> | undefined;

    let buyerVatId: string | undefined;
    for (const reg of asArray(buyerParty?.['ram:SpecifiedTaxRegistration'])) {
      const entry = reg as Record<string, unknown>;
      const schemeId = attr(entry['ram:ID'], 'schemeID');
      const value = text(entry['ram:ID']);
      if (schemeId === 'VA') buyerVatId = orUndef(value);
    }

    // Buyer email: URIUniversalCommunication where schemeID = 'EM'
    let buyerEmail: string | undefined;
    const buyerUri = buyerParty?.['ram:URIUniversalCommunication'] as Record<string, unknown> | undefined;
    if (buyerUri && attr(buyerUri['ram:URIID'], 'schemeID') === 'EM') {
      buyerEmail = orUndef(text(buyerUri['ram:URIID']));
    }
    // Fallback: SpecifiedLegalOrganization or DefinedTradeContact email
    if (!buyerEmail) {
      const buyerContact = buyerParty?.['ram:DefinedTradeContact'] as Record<string, unknown> | undefined;
      const buyerEmailComm = buyerContact?.['ram:EmailURIUniversalCommunication'] as Record<string, unknown> | undefined;
      buyerEmail = orUndef(text(buyerEmailComm?.['ram:URIID']));
    }

    // ------------------------------------------------------------------
    // Payment (BG-16)
    // ------------------------------------------------------------------
    const payMeans = settlement?.['ram:SpecifiedTradeSettlementPaymentMeans'] as Record<string, unknown> | undefined;
    const paymentMeansCode = text(payMeans?.['ram:TypeCode']) || '58';
    const paymentReference = orUndef(text(settlement?.['ram:PaymentReference']));

    const creditorAccount = payMeans?.['ram:PayeePartyCreditorFinancialAccount'] as Record<string, unknown> | undefined;
    const iban = orUndef(text(creditorAccount?.['ram:IBANID']));
    const accountName = orUndef(text(creditorAccount?.['ram:AccountName']));

    const creditorInstitution = payMeans?.['ram:PayeeSpecifiedCreditorFinancialInstitution'] as Record<string, unknown> | undefined;
    const bic = orUndef(text(creditorInstitution?.['ram:BICID']));

    // Payment terms + due date
    const payTerms = settlement?.['ram:SpecifiedTradePaymentTerms'] as Record<string, unknown> | undefined;
    const paymentTerms = orUndef(text(payTerms?.['ram:Description'])?.trim());
    const dueDateTimeNode = payTerms?.['ram:DueDateDateTime'] as Record<string, unknown> | undefined;
    const dueDate = dueDateTimeNode
      ? orUndef(parseCiiDate(dueDateTimeNode['udt:DateTimeString']))
      : undefined;

    // ------------------------------------------------------------------
    // Tax (BG-23)
    // ------------------------------------------------------------------
    const taxes = asArray(settlement?.['ram:ApplicableTradeTax']);
    const firstTax = taxes[0] as Record<string, unknown> | undefined;
    const taxCategoryCode = text(firstTax?.['ram:CategoryCode']) || 'S';
    const taxRate = parseFloat(text(firstTax?.['ram:RateApplicablePercent'])) || 0;

    // ------------------------------------------------------------------
    // Kleinunternehmer detection
    // ------------------------------------------------------------------
    const kleinunternehmer =
      taxCategoryCode === 'E' && taxRate === 0 && (note ?? '').includes('§19');

    // ------------------------------------------------------------------
    // Monetary totals (BG-22)
    // ------------------------------------------------------------------
    const monetary = settlement?.['ram:SpecifiedTradeSettlementHeaderMonetarySummation'] as Record<string, unknown> | undefined;
    const totalNetAmount = parseFloat(text(monetary?.['ram:LineTotalAmount'])) || undefined;
    const totalGrossAmount = parseFloat(text(monetary?.['ram:GrandTotalAmount'])) || undefined;
    const amountDue = parseFloat(text(monetary?.['ram:DuePayableAmount'])) || undefined;

    // Tax total: prefer the TaxTotalAmount summary field; fall back to summing
    // individual tax entries (handles multiple VAT rates)
    let totalTaxAmount: number | undefined;
    const taxTotalRaw = parseFloat(text(monetary?.['ram:TaxTotalAmount']));
    if (!isNaN(taxTotalRaw) && taxTotalRaw !== 0) {
      totalTaxAmount = taxTotalRaw;
    } else {
      const summedTax = taxes.reduce((sum: number, t: unknown) => {
        const tNode = t as Record<string, unknown>;
        return sum + (parseFloat(text(tNode['ram:CalculatedAmount'])) || 0);
      }, 0);
      totalTaxAmount = summedTax !== 0 ? summedTax : undefined;
    }

    const prepaidRaw = parseFloat(text(monetary?.['ram:TotalPrepaidAmount']));
    const prepaidAmount = !isNaN(prepaidRaw) && prepaidRaw > 0 ? prepaidRaw : undefined;

    // ------------------------------------------------------------------
    // Line items
    // ------------------------------------------------------------------
    const lineItems = asArray(transaction?.['ram:IncludedSupplyChainTradeLineItem']);
    const lines: InvoiceLineDto[] = lineItems.map((liRaw: unknown, idx: number) => {
      const li = liRaw as Record<string, unknown>;
      const lineDoc = li['ram:AssociatedDocumentLineDocument'] as Record<string, unknown> | undefined;
      const product = li['ram:SpecifiedTradeProduct'] as Record<string, unknown> | undefined;
      const tradeDelivery = li['ram:SpecifiedLineTradeDelivery'] as Record<string, unknown> | undefined;
      const tradeSettlement = li['ram:SpecifiedLineTradeSettlement'] as Record<string, unknown> | undefined;
      const tradeAgreement = li['ram:SpecifiedLineTradeAgreement'] as Record<string, unknown> | undefined;

      const lineTax = tradeSettlement?.['ram:ApplicableTradeTax'] as Record<string, unknown> | undefined;
      const qty = tradeDelivery?.['ram:BilledQuantity'];
      const netPrice = tradeAgreement?.['ram:NetPriceProductTradePrice'] as Record<string, unknown> | undefined;
      const lineMonetary = tradeSettlement?.['ram:SpecifiedTradeSettlementLineMonetarySummation'] as Record<string, unknown> | undefined;

      const lineVatCategoryCode = text(lineTax?.['ram:CategoryCode']) || taxCategoryCode;
      const lineVatRateRaw = parseFloat(text(lineTax?.['ram:RateApplicablePercent']));
      const lineVatRate = isNaN(lineVatRateRaw) ? taxRate : lineVatRateRaw;

      return {
        lineNumber: parseInt(text(lineDoc?.['ram:LineID']), 10) || idx + 1,
        quantity: parseFloat(text(qty)) || 1,
        unitCode: attr(qty, 'unitCode') || 'C62',
        itemName: text(product?.['ram:Name']) || '',
        itemDescription: orUndef(text(product?.['ram:Description'])),
        netPrice: parseFloat(text(netPrice?.['ram:ChargeAmount'])) || 0,
        vatCategoryCode: lineVatCategoryCode,
        vatRate: lineVatRate,
        lineNetAmount: parseFloat(text(lineMonetary?.['ram:LineTotalAmount'])) || 0,
      } satisfies InvoiceLineDto;
    });

    // ------------------------------------------------------------------
    // Assemble InvoiceDto
    // ------------------------------------------------------------------
    return {
      invoiceNumber,
      invoiceDate,
      invoiceTypeCode,
      currencyCode,
      dueDate,
      buyerReference,
      note,
      deliveryDate,
      orderReference,
      contractReference,

      seller: {
        name: sellerName,
        street: text(sellerAddress?.['ram:LineOne']) || '',
        city: text(sellerAddress?.['ram:CityName']) || '',
        postalCode: text(sellerAddress?.['ram:PostcodeCode']) || '',
        countryCode: text(sellerAddress?.['ram:CountryID']) || 'DE',
        vatId: sellerVatId,
        taxNumber: sellerTaxNumber,
        contactName: orUndef(text(sellerContact?.['ram:PersonName'])),
        contactPhone: orUndef(text(sellerPhone?.['ram:CompleteNumber'])),
        contactEmail: orUndef(text(sellerEmailComm?.['ram:URIID'])),
      },

      buyer: {
        name: buyerName,
        street: text(buyerAddress?.['ram:LineOne']) || '',
        city: text(buyerAddress?.['ram:CityName']) || '',
        postalCode: text(buyerAddress?.['ram:PostcodeCode']) || '',
        countryCode: text(buyerAddress?.['ram:CountryID']) || 'DE',
        vatId: buyerVatId,
        email: buyerEmail,
      },

      paymentMeansCode,
      paymentTerms,
      iban,
      bic,
      paymentReference,
      accountName,

      taxCategoryCode,
      taxRate,
      kleinunternehmer,

      totalNetAmount,
      totalTaxAmount,
      totalGrossAmount,
      amountDue,
      prepaidAmount,

      lines,
    };
  }
}
