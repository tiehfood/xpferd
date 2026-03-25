export interface PartyDto {
  id?: number;
  type: 'seller' | 'buyer';
  name: string;
  street: string;
  city: string;
  postalCode: string;
  countryCode: string;
  vatId?: string;
  taxNumber?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  email?: string;
}

export interface SellerDto {
  name: string;                    // BT-27
  street: string;                  // BT-35
  city: string;                    // BT-37
  postalCode: string;              // BT-38
  countryCode: string;             // BT-40
  vatId?: string;                  // BT-31
  taxNumber?: string;              // BT-32
  contactName?: string;            // BT-41
  contactPhone?: string;           // BT-42
  contactEmail?: string;           // BT-43
}

export interface BuyerDto {
  name: string;                    // BT-44
  street: string;                  // BT-50
  city: string;                    // BT-52
  postalCode: string;              // BT-53
  countryCode: string;             // BT-55
  vatId?: string;                  // BT-48
  email?: string;                  // BT-49
}

export interface InvoiceLineDto {
  id?: number;
  invoiceId?: number;
  lineNumber: number;
  quantity: number;
  unitCode: string;                // BT-130 (UN/ECE Recommendation 20)
  itemName: string;                // BT-153
  itemDescription?: string;         // BT-154 Item description
  netPrice: number;                // BT-146
  vatCategoryCode: string;         // BT-151
  vatRate: number;                 // BT-152
  lineNetAmount: number;           // BT-131
}

export interface InvoiceDto {
  id?: number;
  createdAt?: string;
  updatedAt?: string;

  // Header (BG-1)
  invoiceNumber: string;           // BT-1
  invoiceDate: string;             // BT-2 (YYYY-MM-DD)
  invoiceTypeCode: string;         // BT-3
  currencyCode: string;            // BT-5
  dueDate?: string;                // BT-9
  buyerReference: string;          // BT-10 (Leitweg-ID)
  note?: string;                    // BT-22 Invoice note
  deliveryDate?: string;            // BT-72 YYYY-MM-DD (Leistungsdatum)
  orderReference?: string;          // BT-13 Purchase order reference (Bestellnummer)
  contractReference?: string;       // BT-12 Contract reference (Vertragsnummer)

  // Seller (BG-4)
  seller: SellerDto;

  // Buyer (BG-7)
  buyer: BuyerDto;

  // Payment (BG-16)
  paymentMeansCode: string;        // BT-81
  paymentTerms?: string;           // BT-20
  iban?: string;                   // BT-84
  bic?: string;                    // BT-86
  paymentReference?: string;        // BT-83 Remittance information (Verwendungszweck)
  accountName?: string;             // BT-85 Payment account name

  // Tax (BG-23)
  taxCategoryCode: string;         // BT-118
  taxRate: number;                 // BT-119

  // Kleinunternehmerregelung (§19 UStG)
  kleinunternehmer: boolean;       // VAT-exempt small business

  // Totals (BG-22) - calculated server-side
  totalNetAmount?: number;         // BT-106
  totalTaxAmount?: number;         // BT-110
  totalGrossAmount?: number;       // BT-112
  amountDue?: number;              // BT-115
  prepaidAmount?: number;           // BT-113 Paid amount (Anzahlung)

  // Line items (BG-25)
  lines: InvoiceLineDto[];
}

export interface InvoiceNumberTemplateDto {
  id?: number;
  name: string;
  prefix: string;
  digits: number;              // 1-6
  nextNumber: number;
}

export interface PaymentTemplateDto {
  id?: number;
  name: string;
  paymentMeansCode: string;
  iban?: string;
  bic?: string;
  paymentTerms?: string;
}

export interface LineItemTemplateDto {
  id?: number;
  name: string;
  unitCode: string;
  netPrice: number;
  vatCategoryCode: string;
  vatRate: number;
}

export interface InvoiceTemplateDto {
  id?: number;
  name: string;
  data: string;  // JSON-serialized invoice data
}

export interface InvoiceSummaryDto {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  buyerName: string;
  totalGrossAmount: number;
  currencyCode: string;
  updatedAt: string;
}

export interface PdfBlockDto {
  id: string;
  type: 'seller-address' | 'buyer-address' | 'invoice-header' | 'lines-table'
      | 'totals' | 'payment-info' | 'free-text' | 'image' | 'line'
      | 'invoice-title' | 'invoice-number' | 'invoice-date' | 'due-date' | 'buyer-reference'
      | 'total-net' | 'total-tax' | 'total-gross'
      | 'payment-means' | 'iban-bic' | 'payment-terms'
      | 'kleinunternehmer-note';
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  fontColor?: string;
  fontWeight?: 'normal' | 'bold';
  fontFamily?: string;
  content?: string;
  columns?: string[];
  columnAlignments?: Partial<Record<'pos' | 'name' | 'qty' | 'unit' | 'price' | 'total', 'left' | 'right' | 'center'>>;
  showHeader?: boolean;
  lineHeight?: number;
  tableStyle?: 'minimal' | 'grid' | 'striped' | 'compact' | 'elegant' | 'modern';
  tableHeaderBgColor?: string;
  tableHeaderLineColor?: string;
  lineThickness?: number;
  lineColor?: string;
  lineDirection?: 'horizontal' | 'vertical';
  lockAspectRatio?: boolean;
  textAlign?: 'left' | 'center' | 'right' | 'block';
  paddingLeft?: number;   // pts — text inset from block left edge (default 0)
  paddingRight?: number;  // pts — text inset from block right edge (default 0)
}

export interface CustomFontDto {
  name: string;
  data: string;       // base64-encoded font bytes — normal weight
  dataBold?: string;  // base64-encoded bold variant (optional)
  mimeType: string;   // 'font/ttf' | 'font/otf'
}

export interface GuideLineDto {
  id: string;
  orientation: 'horizontal' | 'vertical';
  position: number;  // pts from top (h) or left (v)
  locked: boolean;
}

export interface PdfTemplateDto {
  id?: number;
  name: string;
  pageSize: 'a4' | 'letter';
  orientation: 'portrait' | 'landscape';
  blocks: PdfBlockDto[];
  guideLines?: GuideLineDto[];
  logoData?: string;
  logoMimeType?: string;
  customFonts?: CustomFontDto[];
  marginLeft?: number;   // cm, default 2.5
  marginRight?: number;  // cm, default 2.5
  marginTop?: number;    // cm, default 2.5
  marginBottom?: number; // cm, default 2.5
  createdAt?: string;
  updatedAt?: string;
}

export interface AppSettingsDto {
  locale: string;       // e.g. 'de-DE'
  dateFormat: string;   // e.g. 'DD.MM.YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY', 'DD-MM-YYYY'
  numberFormat: string; // e.g. 'de-DE' (1.000,00) or 'en-US' (1,000.00)
}
