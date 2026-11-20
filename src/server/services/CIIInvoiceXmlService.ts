import { create } from 'xmlbuilder2';
import type { InvoiceDto, SellerDto, BuyerDto } from '../../shared/types/index.js';
import { KLEINUNTERNEHMER_NOTE } from '../../shared/constants/index.js';

/**
 * Generates an EN 16931 / XRechnung 3.0 invoice using UN/CEFACT CII D16B.
 * This syntax is required for the structured invoice data embedded in a
 * ZUGFeRD / Factur-X PDF. Keep XRechnungXmlService for standalone UBL exports.
 */
export class CIIInvoiceXmlService {
  private static readonly GUIDELINE_ID =
    'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0';

  generate(invoice: InvoiceDto): string {
    const doc = create({ version: '1.0', encoding: 'UTF-8' }).ele('rsm:CrossIndustryInvoice', {
      'xmlns:rsm': 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
      'xmlns:ram': 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
      'xmlns:udt': 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
    });

    // BT-23 and BT-24: business process and XRechnung 3.0 CIUS identifiers.
    const context = doc.ele('rsm:ExchangedDocumentContext');
    context.ele('ram:BusinessProcessSpecifiedDocumentContextParameter')
      .ele('ram:ID').txt('urn:fdc:peppol.eu:2017:poacc:billing:01:1.0');
    context.ele('ram:GuidelineSpecifiedDocumentContextParameter')
      .ele('ram:ID').txt(CIIInvoiceXmlService.GUIDELINE_ID);

    // BG-1: invoice header.
    const header = doc.ele('rsm:ExchangedDocument');
    header.ele('ram:ID').txt(invoice.invoiceNumber);
    header.ele('ram:TypeCode').txt(invoice.invoiceTypeCode);
    header.ele('ram:IssueDateTime').ele('udt:DateTimeString', { format: '102' })
      .txt(this.ciiDate(invoice.invoiceDate));
    const note = invoice.kleinunternehmer ? KLEINUNTERNEHMER_NOTE : invoice.note;
    if (note) header.ele('ram:IncludedNote').ele('ram:Content').txt(note);

    const transaction = doc.ele('rsm:SupplyChainTradeTransaction');

    // BG-25: invoice lines. CII requires the line items before the header parties.
    for (const line of invoice.lines) {
      const item = transaction.ele('ram:IncludedSupplyChainTradeLineItem');
      item.ele('ram:AssociatedDocumentLineDocument').ele('ram:LineID').txt(String(line.lineNumber));
      const product = item.ele('ram:SpecifiedTradeProduct');
      product.ele('ram:Name').txt(line.itemName);
      if (line.itemDescription) product.ele('ram:Description').txt(line.itemDescription);

      item.ele('ram:SpecifiedLineTradeAgreement')
        .ele('ram:NetPriceProductTradePrice')
        .ele('ram:ChargeAmount').txt(this.fmt(line.netPrice));

      item.ele('ram:SpecifiedLineTradeDelivery')
        .ele('ram:BilledQuantity', { unitCode: line.unitCode }).txt(String(line.quantity));

      const lineSettlement = item.ele('ram:SpecifiedLineTradeSettlement');
      const lineTax = lineSettlement.ele('ram:ApplicableTradeTax');
      lineTax.ele('ram:TypeCode').txt('VAT');
      lineTax.ele('ram:CategoryCode').txt(line.vatCategoryCode || invoice.taxCategoryCode);
      if (line.vatRate !== undefined && line.vatRate !== null) {
        lineTax.ele('ram:RateApplicablePercent').txt(String(line.vatRate));
      }
      lineSettlement.ele('ram:SpecifiedTradeSettlementLineMonetarySummation')
        .ele('ram:LineTotalAmount').txt(this.fmt(line.lineNetAmount));
    }

    // BG-4 / BG-7 and references.
    const agreement = transaction.ele('ram:ApplicableHeaderTradeAgreement');
    if (invoice.buyerReference) agreement.ele('ram:BuyerReference').txt(invoice.buyerReference);
    this.addParty(agreement, 'ram:SellerTradeParty', invoice.seller, true);
    this.addParty(agreement, 'ram:BuyerTradeParty', invoice.buyer, false);
    if (invoice.orderReference) {
      agreement.ele('ram:BuyerOrderReferencedDocument')
        .ele('ram:IssuerAssignedID').txt(invoice.orderReference);
    }
    if (invoice.contractReference) {
      agreement.ele('ram:ContractReferencedDocument')
        .ele('ram:IssuerAssignedID').txt(invoice.contractReference);
    }

    // BG-13: delivery / performance date (BT-72).
    if (invoice.deliveryDate) {
      transaction.ele('ram:ApplicableHeaderTradeDelivery')
        .ele('ram:ActualDeliverySupplyChainEvent')
        .ele('ram:OccurrenceDateTime')
        .ele('udt:DateTimeString', { format: '102' }).txt(this.ciiDate(invoice.deliveryDate));
    }

    // BG-16, BG-23 and BG-22: settlement, VAT breakdown and totals.
	const settlement = transaction.ele('ram:ApplicableHeaderTradeSettlement');
	if (invoice.paymentReference) settlement.ele('ram:PaymentReference').txt(invoice.paymentReference);
	settlement.ele('ram:InvoiceCurrencyCode').txt(invoice.currencyCode);

    const paymentMeans = settlement.ele('ram:SpecifiedTradeSettlementPaymentMeans');
    paymentMeans.ele('ram:TypeCode').txt(invoice.paymentMeansCode);
    if (invoice.accountName) paymentMeans.ele('ram:Information').txt(invoice.accountName);
    if (invoice.iban) {
      const account = paymentMeans.ele('ram:PayeePartyCreditorFinancialAccount');
      account.ele('ram:IBANID').txt(invoice.iban);
      if (invoice.accountName) account.ele('ram:AccountName').txt(invoice.accountName);
    }
    if (invoice.bic) {
      paymentMeans.ele('ram:PayeeSpecifiedCreditorFinancialInstitution')
        .ele('ram:BICID').txt(invoice.bic);
    }

    const taxGroups = this.taxGroups(invoice);
    for (const group of taxGroups) {
      const tax = settlement.ele('ram:ApplicableTradeTax');
      tax.ele('ram:CalculatedAmount').txt(this.fmt(group.taxAmount));
      tax.ele('ram:TypeCode').txt('VAT');
      if (invoice.kleinunternehmer) tax.ele('ram:ExemptionReason').txt(KLEINUNTERNEHMER_NOTE);
      tax.ele('ram:BasisAmount').txt(this.fmt(group.baseAmount));
      tax.ele('ram:CategoryCode').txt(group.categoryCode);
      tax.ele('ram:RateApplicablePercent').txt(String(group.rate));
    }

    if (invoice.paymentTerms || invoice.dueDate) {
      const terms = settlement.ele('ram:SpecifiedTradePaymentTerms');
      if (invoice.paymentTerms) terms.ele('ram:Description').txt(invoice.paymentTerms);
      if (invoice.dueDate) {
        terms.ele('ram:DueDateDateTime').ele('udt:DateTimeString', { format: '102' })
          .txt(this.ciiDate(invoice.dueDate));
      }
    }

    const calculatedTaxAmount = taxGroups.reduce(
      (sum, group) => sum + group.taxAmount, 0
    );

    const totalNetAmount = invoice.totalNetAmount ?? this.sumLines(invoice);
    const totalTaxAmount = invoice.totalTaxAmount ?? calculatedTaxAmount;
    const totalGrossAmount = invoice.totalGrossAmount
      ?? this.round2(totalNetAmount + totalTaxAmount);
    const amountDue = invoice.amountDue ?? totalGrossAmount;

    const totals = settlement.ele('ram:SpecifiedTradeSettlementHeaderMonetarySummation');

    totals.ele('ram:LineTotalAmount').txt(this.fmt(totalNetAmount));
    totals.ele('ram:TaxBasisTotalAmount').txt(this.fmt(totalNetAmount));

    totals.ele('ram:TaxTotalAmount', { currencyID: invoice.currencyCode })
      .txt(this.fmt(totalTaxAmount));

    totals.ele('ram:GrandTotalAmount').txt(this.fmt(totalGrossAmount));

    if (invoice.prepaidAmount && invoice.prepaidAmount > 0) {
      totals.ele('ram:TotalPrepaidAmount').txt(this.fmt(invoice.prepaidAmount));
    }

    totals.ele('ram:DuePayableAmount').txt(this.fmt(amountDue));

    return doc.end({ prettyPrint: true });
  }

  private addParty(parent: any, tagName: string, party: SellerDto | BuyerDto, isSeller: boolean): void {
    const node = parent.ele(tagName);
    node.ele('ram:Name').txt(party.name);

    // Keep children in the order defined by the UN/CEFACT CII schema.
    if (isSeller) {
      const seller = party as SellerDto;
      const legalId = seller.vatId || seller.taxNumber;
      if (legalId) node.ele('ram:SpecifiedLegalOrganization').ele('ram:ID').txt(legalId);

      if (seller.contactName || seller.contactPhone || seller.contactEmail) {
        const contact = node.ele('ram:DefinedTradeContact');
        if (seller.contactName) contact.ele('ram:PersonName').txt(seller.contactName);
        if (seller.contactPhone) contact.ele('ram:TelephoneUniversalCommunication')
          .ele('ram:CompleteNumber').txt(seller.contactPhone);
        if (seller.contactEmail) contact.ele('ram:EmailURIUniversalCommunication')
          .ele('ram:URIID').txt(seller.contactEmail);
      }
    }

    const address = node.ele('ram:PostalTradeAddress');
    if (party.postalCode) address.ele('ram:PostcodeCode').txt(party.postalCode);
    if (party.street) address.ele('ram:LineOne').txt(party.street);
    if (party.city) address.ele('ram:CityName').txt(party.city);
    if (party.countryCode) address.ele('ram:CountryID').txt(party.countryCode);

    const endpoint = isSeller ? (party as SellerDto).contactEmail : (party as BuyerDto).email;
    if (endpoint) node.ele('ram:URIUniversalCommunication')
      .ele('ram:URIID', { schemeID: 'EM' }).txt(endpoint);

    if (isSeller) {
      const seller = party as SellerDto;
      if (seller.vatId) node.ele('ram:SpecifiedTaxRegistration')
        .ele('ram:ID', { schemeID: 'VA' }).txt(seller.vatId);
      if (seller.taxNumber) node.ele('ram:SpecifiedTaxRegistration')
        .ele('ram:ID', { schemeID: 'FC' }).txt(seller.taxNumber);
    } else {
      const buyer = party as BuyerDto;
      if (buyer.vatId) node.ele('ram:SpecifiedTaxRegistration')
        .ele('ram:ID', { schemeID: 'VA' }).txt(buyer.vatId);
    }
  }

  private taxGroups(invoice: InvoiceDto): Array<{ categoryCode: string; rate: number; baseAmount: number; taxAmount: number }> {
    const lines = invoice.lines.length ? invoice.lines : [{
      lineNetAmount: invoice.totalNetAmount ?? 0,
      vatCategoryCode: invoice.taxCategoryCode,
      vatRate: invoice.taxRate,
    }];
    const groups = new Map<string, { categoryCode: string; rate: number; baseAmount: number }>();
    for (const line of lines) {
      const categoryCode = line.vatCategoryCode || invoice.taxCategoryCode;
      const rate = Number(line.vatRate ?? invoice.taxRate);
      const key = `${categoryCode}|${rate}`;
      const group = groups.get(key) ?? { categoryCode, rate, baseAmount: 0 };
      group.baseAmount += line.lineNetAmount;
      groups.set(key, group);
    }
    return [...groups.values()].map(group => ({
      ...group,
      baseAmount: this.round2(group.baseAmount),
      taxAmount: group.rate === 0 ? 0 : this.round2(group.baseAmount * group.rate / 100),
    }));
  }

  private sumLines(invoice: InvoiceDto): number {
    return invoice.lines.reduce((sum, line) => sum + line.lineNetAmount, 0);
  }

  private ciiDate(date: string): string {
    return date.replaceAll('-', '').slice(0, 8);
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private fmt(value: number): string {
    return this.round2(value).toFixed(2);
  }
}
