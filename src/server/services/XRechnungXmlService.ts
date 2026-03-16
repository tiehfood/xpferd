import { create } from 'xmlbuilder2';
import type { InvoiceDto } from '../../shared/types';
import { KLEINUNTERNEHMER_NOTE } from '../../shared/constants/index.js';

export class XRechnungXmlService {
  private static readonly CUSTOMIZATION_ID =
    'urn:cen.eu:en16931:2017#compliant#urn:xeinkauf.de:kosit:xrechnung_3.0';
  private static readonly PROFILE_ID =
    'urn:fdc:peppol.eu:2017:poacc:billing:01:1.0';

  generate(invoice: InvoiceDto): string {
    const doc = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('ubl:Invoice', {
        'xmlns:ubl': 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
        'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
        'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
      });

    doc.ele('cbc:CustomizationID').txt(XRechnungXmlService.CUSTOMIZATION_ID);
    doc.ele('cbc:ProfileID').txt(XRechnungXmlService.PROFILE_ID);
    doc.ele('cbc:ID').txt(invoice.invoiceNumber);
    doc.ele('cbc:IssueDate').txt(invoice.invoiceDate);
    if (invoice.dueDate) {
      doc.ele('cbc:DueDate').txt(invoice.dueDate);
    }
    doc.ele('cbc:InvoiceTypeCode').txt(invoice.invoiceTypeCode);

    // Kleinunternehmer note (BT-22) — must appear before DocumentCurrencyCode per UBL 2.1
    if (invoice.kleinunternehmer) {
      doc.ele('cbc:Note').txt(KLEINUNTERNEHMER_NOTE);
    }

    doc.ele('cbc:DocumentCurrencyCode').txt(invoice.currencyCode);

    // Buyer Reference (BT-10) — mandatory for XRechnung (BR-DE-15)
    doc.ele('cbc:BuyerReference').txt(invoice.buyerReference || 'n/a');

    // Seller (AccountingSupplierParty)
    this.addParty(doc, 'cac:AccountingSupplierParty', invoice.seller, true);

    // Buyer (AccountingCustomerParty)
    this.addParty(doc, 'cac:AccountingCustomerParty', invoice.buyer, false);

    // Payment Means (BG-16)
    const paymentMeans = doc.ele('cac:PaymentMeans');
    paymentMeans.ele('cbc:PaymentMeansCode').txt(invoice.paymentMeansCode);
    if (invoice.iban) {
      const payeeAccount = paymentMeans.ele('cac:PayeeFinancialAccount');
      payeeAccount.ele('cbc:ID').txt(invoice.iban);
      if (invoice.bic) {
        payeeAccount.ele('cac:FinancialInstitutionBranch')
          .ele('cbc:ID').txt(invoice.bic);
      }
    }

    // Payment Terms (BT-20)
    if (invoice.paymentTerms) {
      doc.ele('cac:PaymentTerms')
        .ele('cbc:Note').txt(invoice.paymentTerms);
    }

    // Tax Total (BG-23)
    const taxTotal = doc.ele('cac:TaxTotal');
    taxTotal.ele('cbc:TaxAmount', { currencyID: invoice.currencyCode })
      .txt(this.fmt(invoice.totalTaxAmount ?? 0));

    const taxSubtotal = taxTotal.ele('cac:TaxSubtotal');
    taxSubtotal.ele('cbc:TaxableAmount', { currencyID: invoice.currencyCode })
      .txt(this.fmt(invoice.totalNetAmount ?? 0));
    taxSubtotal.ele('cbc:TaxAmount', { currencyID: invoice.currencyCode })
      .txt(this.fmt(invoice.totalTaxAmount ?? 0));

    const taxCategory = taxSubtotal.ele('cac:TaxCategory');
    taxCategory.ele('cbc:ID').txt(invoice.taxCategoryCode);
    taxCategory.ele('cbc:Percent').txt(String(invoice.taxRate));
    if (invoice.kleinunternehmer) {
      taxCategory.ele('cbc:TaxExemptionReasonCode').txt('vatex-eu-132-1b');
      taxCategory.ele('cbc:TaxExemptionReason').txt(KLEINUNTERNEHMER_NOTE);
    }
    taxCategory.ele('cac:TaxScheme').ele('cbc:ID').txt('VAT');

    // Legal Monetary Total (BG-22)
    const monetaryTotal = doc.ele('cac:LegalMonetaryTotal');
    monetaryTotal.ele('cbc:LineExtensionAmount', { currencyID: invoice.currencyCode })
      .txt(this.fmt(invoice.totalNetAmount ?? 0));
    monetaryTotal.ele('cbc:TaxExclusiveAmount', { currencyID: invoice.currencyCode })
      .txt(this.fmt(invoice.totalNetAmount ?? 0));
    monetaryTotal.ele('cbc:TaxInclusiveAmount', { currencyID: invoice.currencyCode })
      .txt(this.fmt(invoice.totalGrossAmount ?? 0));
    monetaryTotal.ele('cbc:PayableAmount', { currencyID: invoice.currencyCode })
      .txt(this.fmt(invoice.amountDue ?? 0));

    // Invoice Lines (BG-25)
    for (const line of invoice.lines) {
      const invLine = doc.ele('cac:InvoiceLine');
      invLine.ele('cbc:ID').txt(String(line.lineNumber));
      invLine.ele('cbc:InvoicedQuantity', { unitCode: line.unitCode })
        .txt(String(line.quantity));
      invLine.ele('cbc:LineExtensionAmount', { currencyID: invoice.currencyCode })
        .txt(this.fmt(line.lineNetAmount));

      const item = invLine.ele('cac:Item');
      item.ele('cbc:Name').txt(line.itemName);
      const classifiedTax = item.ele('cac:ClassifiedTaxCategory');
      classifiedTax.ele('cbc:ID').txt(line.vatCategoryCode);
      classifiedTax.ele('cbc:Percent').txt(String(line.vatRate));
      classifiedTax.ele('cac:TaxScheme').ele('cbc:ID').txt('VAT');

      const price = invLine.ele('cac:Price');
      price.ele('cbc:PriceAmount', { currencyID: invoice.currencyCode })
        .txt(this.fmt(line.netPrice));
    }

    return doc.end({ prettyPrint: true });
  }

  private addParty(
    parent: ReturnType<typeof create>,
    tagName: string,
    party: { name: string; street: string; city: string; postalCode: string; countryCode: string; vatId?: string; taxNumber?: string; contactName?: string; contactPhone?: string; contactEmail?: string; email?: string },
    isSeller: boolean,
  ): void {
    const wrapper = (parent as any).ele(tagName);
    const partyEl = wrapper.ele('cac:Party');

    // EndpointID (BT-34 seller / BT-49 buyer) — mandatory for PEPPOL (R020, R010)
    const endpointEmail = isSeller ? party.contactEmail : party.email;
    partyEl.ele('cbc:EndpointID', { schemeID: 'EM' }).txt(endpointEmail || '');

    // Postal Address (BG-5 / BG-8)
    const address = partyEl.ele('cac:PostalAddress');
    address.ele('cbc:StreetName').txt(party.street);
    address.ele('cbc:CityName').txt(party.city);
    address.ele('cbc:PostalZone').txt(party.postalCode);
    address.ele('cac:Country').ele('cbc:IdentificationCode').txt(party.countryCode);

    // VAT Registration — BT-31 (PartyTaxScheme with VAT scheme)
    if (party.vatId) {
      const vatScheme = partyEl.ele('cac:PartyTaxScheme');
      vatScheme.ele('cbc:CompanyID').txt(party.vatId);
      vatScheme.ele('cac:TaxScheme').ele('cbc:ID').txt('VAT');
    }

    // Tax Registration — BT-32 (PartyTaxScheme with FC scheme, for Steuernummer)
    if (isSeller && party.taxNumber) {
      const taxScheme = partyEl.ele('cac:PartyTaxScheme');
      taxScheme.ele('cbc:CompanyID').txt(party.taxNumber);
      taxScheme.ele('cac:TaxScheme').ele('cbc:ID').txt('FC');
    }

    // Legal Entity (BT-27 / BT-44)
    const legalEntity = partyEl.ele('cac:PartyLegalEntity');
    legalEntity.ele('cbc:RegistrationName').txt(party.name);
    // BT-30: Seller legal registration identifier — satisfies BR-CO-26
    if (isSeller) {
      const companyId = party.vatId || party.taxNumber || '';
      if (companyId) {
        legalEntity.ele('cbc:CompanyID').txt(companyId);
      }
    }

    // Seller Contact (BG-6) — mandatory for XRechnung (BR-DE-2)
    if (isSeller) {
      const contact = partyEl.ele('cac:Contact');
      contact.ele('cbc:Name').txt(party.contactName || '');
      contact.ele('cbc:Telephone').txt(party.contactPhone || '');
      contact.ele('cbc:ElectronicMail').txt(party.contactEmail || '');
    }
  }

  private fmt(n: number): string {
    return n.toFixed(2);
  }
}
