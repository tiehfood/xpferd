<script lang="ts">
  import { push } from 'svelte-spa-router';
  import { pdfTemplateApi } from '../lib/api/pdfTemplateApi';
  import { invoiceApi } from '../lib/api/invoiceApi';
  import type { PdfBlockDto, PdfTemplateDto, InvoiceDto, GuideLineDto, CustomFontDto } from '../../shared/types/Invoice';
  import { PAYMENT_MEANS_CODES, UNIT_CODES } from '$shared/constants';
  import { formatIban, fmtDate } from '$shared/constants/format';
  import { getSettings } from '../lib/settingsStore.svelte.js';
  import { computeBlockContentHeight } from '$shared/utils/blockMetrics';
  import { snapBlockToOthers, alignToJustify, snapEdgeToBlockBounds } from '$shared/utils/blockSnapUtils';
  import { t } from '../lib/i18n.js';
  import { injectFontFaces } from '../lib/utils/fontFaces.js';
  import { extractFontName, arrayBufferToBase64 } from '../lib/utils/fontName.js';
  import { guideToPosition, positionToGuide } from '$shared/utils/guideConvert';

  let { params = {} } = $props();

  // --- Mode detection ---
  // Wildcard route: /pdf-templates/* passes the remainder as params.wild
  // /pdf-templates/new → wild='new', /pdf-templates/123 → wild='123'
  let mode: 'list' | 'editor' = $derived(
    params.wild ? 'editor' : 'list'
  );
  let templateId: number | null = $derived(
    params.wild && params.wild !== 'new' ? Number(params.wild) : null
  );

  // --- List state ---
  let templates: PdfTemplateDto[] = $state([]);
  let listLoading = $state(true);
  let listError = $state('');
  let listInvoices: any[] = $state([]);
  let listSelectedInvoiceId: Record<number, number | null> = $state({});
  let listGenerating: Record<number, boolean> = $state({});
  let listGenError = $state('');

  // --- Editor state ---
  let template: PdfTemplateDto = $state({
    name: '',
    pageSize: 'a4',
    orientation: 'portrait',
    blocks: [],
  });
  let selectedBlockId: string | null = $state(null);
  let saving = $state(false);
  let editorError = $state('');

  // --- Preview state ---
  let invoices: any[] = $state([]);
  let selectedInvoiceId: number | null = $state(null);
  let fullInvoice: InvoiceDto | null = $state(null);
  let previewOpen = $state(false);
  let previewLoading = $state(false);
  let previewBlobUrl: string | null = $state(null);

  // --- Drag state ---
  let dragging = $state(false);
  let dragBlockId: string | null = $state(null);
  let dragStartX = 0;
  let dragStartY = 0;
  let dragBlockStartX = 0;
  let dragBlockStartY = 0;

  // --- Resize state ---
  type ResizeDir = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
  let resizing = $state(false);
  let resizeBlockId: string | null = $state(null);
  let resizeDir: ResizeDir = 'se';
  let resizeStartX = 0;
  let resizeStartY = 0;
  let resizeBlockStartW = 0;
  let resizeBlockStartH = 0;
  let resizeBlockStartX = 0;
  let resizeBlockStartY = 0;

  // --- DIN 5008 overlay state (client-only, not persisted) ---
  let showMargins = $state(false);
  let showWindow = $state(false);
  let showFoldMarks = $state(false);
  let marginLeft = $state(2.5);   // cm
  let marginRight = $state(2.5);  // cm
  let marginTop = $state(2.5);    // cm
  let marginBottom = $state(2.5); // cm

  // --- Block snapping state ---
  let snappingBlockIds: Set<string> = $state(new Set());

  // --- Canvas wrap reference (for zoom-to-fit) ---
  let canvasWrapEl: HTMLElement | null = $state(null);

  // --- Default font for new blocks (set via applyFontToAll) ---
  let defaultFontFamily = $state<string | undefined>(undefined);

  // --- Guide line state ---
  let showCustomGuides = $state(true);
  let showGuidesOnCanvas = $state(true);
  let guideEditInputEl: HTMLInputElement | null = $state(null);

  $effect(() => {
    if (guideEditInputEl) {
      guideEditInputEl.focus();
      guideEditInputEl.select();
    }
  });
  let activeGuideId: string | null = $state(null);
  let draggingGuide = $state(false);
  let guideEditId: string | null = $state(null);
  let guideEditValue = $state('');
  let snappingGuideIds: Set<string> = $state(new Set());
  let guideDragStartPos = 0;
  let guideDragStartMouse = 0;
  let guideDragOrientation: 'horizontal' | 'vertical' = 'horizontal';
  let guideDragTotalMovement = 0;
  let guideDragMouseStartX = 0;
  let guideDragMouseStartY = 0;

  // cm → pts conversion: 1cm = 28.346 pts
  const CM_TO_PTS = 28.346;

  // DIN 5008 measurements in pts (mm × 2.8346)
  const DIN = {
    foldMark1: 297.6,   // 105mm from top
    punchMark: 421.0,   // 148.5mm from top
    foldMark2: 595.3,   // 210mm from top
    windowLeft: 56.7,   // 20mm from left
    windowTop: 127.6,   // 45mm from top
    windowWidth: 255.1, // 90mm
    windowHeight: 127.6,// 45mm
  };

  // --- Canvas ---
  const A4_W = 595;
  const A4_H = 842;
  let canvasScale = $state(0.72);
  let autoZoomedForEditor = $state(false);

  // --- Live PDF Preview ---
  let zugferdExporting = $state(false);

  let pageWidth = $derived(template.orientation === 'landscape' ? A4_H : A4_W);
  let pageHeight = $derived(template.orientation === 'landscape' ? A4_W : A4_H);

  let selectedBlock = $derived(
    template.blocks.find(b => b.id === selectedBlockId) ?? null
  );

  // Sample data for canvas block preview
  const SAMPLE_INVOICE: InvoiceDto = {
    invoiceNumber: 'RE-2024-0042', invoiceDate: '2024-03-15', dueDate: '2024-04-15',
    invoiceTypeCode: '380', currencyCode: 'EUR', buyerReference: 'LW-4200-9876',
    seller: { name: 'Musterfirma GmbH', street: 'Hauptstraße 42', postalCode: '10115', city: 'Berlin', countryCode: 'DE', vatId: 'DE123456789', taxNumber: '30/123/45678' },
    buyer: { name: 'Beispiel AG', street: 'Industrieweg 7', postalCode: '80331', city: 'München', countryCode: 'DE' },
    paymentMeansCode: '58', iban: 'DE89 3704 0044 0532 0130 00', bic: 'COBADEFFXXX',
    paymentTerms: '30 Tage netto', taxRate: 19, taxCategoryCode: 'S', kleinunternehmer: false,
    totalNetAmount: 1250.00, totalTaxAmount: 237.50, totalGrossAmount: 1487.50,
    lines: [
      { lineNumber: 1, itemName: 'Webdesign Startseite', quantity: 1, unitCode: 'HUR', netPrice: 850.00, vatCategoryCode: 'S', vatRate: 19, lineNetAmount: 850.00 },
      { lineNumber: 2, itemName: 'SEO-Optimierung', quantity: 5, unitCode: 'HUR', netPrice: 80.00, vatCategoryCode: 'S', vatRate: 19, lineNetAmount: 400.00 },
    ],
  };

  // Fetch full invoice when selection changes
  $effect(() => {
    const id = selectedInvoiceId;
    if (!id) { fullInvoice = null; return; }
    invoiceApi.get(id).then(inv => { fullInvoice = inv; }).catch(() => { fullInvoice = null; });
  });

  // Use selected invoice if loaded, otherwise sample data
  let previewInvoice: InvoiceDto = $derived(fullInvoice || SAMPLE_INVOICE);

  // Block type metadata — grouped palette
  interface BlockTypeMeta { type: PdfBlockDto['type']; label: string; icon: string; defaultW: number; defaultH: number }
  interface PaletteGroup { key: string; label: string; items: BlockTypeMeta[] }

  const PALETTE_GROUPS: PaletteGroup[] = [
    { key: 'addresses', label: 'Adressen', items: [
      { type: 'seller-address', label: 'Verkäufer', icon: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2|M12 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8', defaultW: 220, defaultH: 105 },
      { type: 'buyer-address', label: 'Käufer', icon: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2|M9 7a4 4 0 1 0 0-8 4 4 0 0 0 0 8|M23 21v-2a4 4 0 0 0-3-3.87|M16 3.13a4 4 0 0 1 0 7.75', defaultW: 220, defaultH: 70 },
    ]},
    { key: 'header', label: 'Kopfdaten', items: [
      { type: 'invoice-title', label: 'Titel', icon: 'M4 7V4h16v3|M9 20h6|M12 4v16', defaultW: 100, defaultH: 22 },
      { type: 'invoice-number', label: 'Rechnungsnr.', icon: 'M4 9h16|M4 15h16|M10 3L8 21|M16 3l-2 18', defaultW: 180, defaultH: 20 },
      { type: 'invoice-date', label: 'Datum', icon: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z|M16 2v4|M8 2v4|M3 10h18', defaultW: 150, defaultH: 20 },
      { type: 'due-date', label: 'Fällig', icon: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z|M16 2v4|M8 2v4|M3 10h18', defaultW: 150, defaultH: 20 },
      { type: 'buyer-reference', label: 'Referenz', icon: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71|M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71', defaultW: 180, defaultH: 20 },
      { type: 'invoice-header', label: 'Komplett', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z|M14 2v6h6|M16 13H8|M16 17H8', defaultW: 220, defaultH: 65 },
    ]},
    { key: 'lines', label: 'Positionen', items: [
      { type: 'lines-table', label: 'Tabelle', icon: 'M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18', defaultW: 500, defaultH: 200 },
    ]},
    { key: 'totals', label: 'Summen', items: [
      { type: 'total-net', label: 'Nettobetrag', icon: 'M12 1v22|M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', defaultW: 200, defaultH: 20 },
      { type: 'total-tax', label: 'USt.', icon: 'M12 1v22|M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', defaultW: 200, defaultH: 20 },
      { type: 'total-gross', label: 'Bruttobetrag', icon: 'M12 1v22|M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', defaultW: 200, defaultH: 20 },
      { type: 'totals', label: 'Komplett', icon: 'M12 1v22|M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6', defaultW: 200, defaultH: 60 },
    ]},
    { key: 'payment', label: 'Zahlung', items: [
      { type: 'payment-means', label: 'Zahlungsart', icon: 'M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z|M1 10h22', defaultW: 200, defaultH: 20 },
      { type: 'iban-bic', label: 'IBAN/BIC', icon: 'M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z|M1 10h22', defaultW: 250, defaultH: 35 },
      { type: 'payment-terms', label: 'Zahlungsziel', icon: 'M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z|M1 10h22', defaultW: 200, defaultH: 20 },
      { type: 'payment-info', label: 'Komplett', icon: 'M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z|M1 10h22', defaultW: 250, defaultH: 80 },
    ]},
    { key: 'misc', label: 'Sonstiges', items: [
      { type: 'free-text', label: 'Freitext', icon: 'M17 10H3|M21 6H3|M21 14H3|M17 18H3', defaultW: 200, defaultH: 40 },
      { type: 'image', label: 'Bild', icon: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z|M8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z|M21 15l-5-5L5 21', defaultW: 120, defaultH: 60 },
      { type: 'line', label: 'Linie', icon: 'M5 12h14', defaultW: 200, defaultH: 2 },
      { type: 'kleinunternehmer-note', label: '§19 UStG', icon: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z|M12 16v-4|M12 8h.01', defaultW: 350, defaultH: 18 },
    ]},
  ];

  // Flat lookup for backward compatibility
  const ALL_BLOCK_TYPES: BlockTypeMeta[] = PALETTE_GROUPS.flatMap(g => g.items);

  // Palette expand/collapse state (all start expanded)
  let expandedGroups: Record<string, boolean> = $state(
    Object.fromEntries(PALETTE_GROUPS.map(g => [g.key, true]))
  );

  function toggleGroup(key: string) {
    expandedGroups = { ...expandedGroups, [key]: !expandedGroups[key] };
  }

  function blockLabel(type: PdfBlockDto['type']): string {
    return ALL_BLOCK_TYPES.find(bt => bt.type === type)?.label ?? type;
  }

  // --- Custom font loading ---
  // Inject @font-face rules via external utility to avoid esbuild-svelte parse issues.
  $effect(() => { injectFontFaces(template.customFonts ?? []); });

  // --- Auto-zoom to page width when entering editor for the first time ---
  $effect(() => {
    if (mode === 'list') { autoZoomedForEditor = false; return; }
    if (mode === 'editor' && canvasWrapEl && !autoZoomedForEditor) {
      autoZoomedForEditor = true;
      zoomToPageWidth();
    }
  });

  // --- Lifecycle ---
  $effect(() => {
    if (mode === 'list') {
      loadList();
    } else {
      loadEditor();
    }
  });

  async function loadList() {
    listLoading = true;
    listError = '';
    try {
      const [tmplList, invList] = await Promise.all([
        pdfTemplateApi.list(),
        invoiceApi.list(),
      ]);
      templates = tmplList;
      listInvoices = invList;
    } catch (e: any) {
      listError = e.message;
    } finally {
      listLoading = false;
    }
  }

  async function loadEditor() {
    editorError = '';
    try {
      // Load invoices for preview dropdown
      invoices = await invoiceApi.list();
      if (invoices.length > 0) selectedInvoiceId = invoices[0].id;

      // Load existing template
      if (templateId) {
        const data = await pdfTemplateApi.get(templateId);
        template = data;
        // Restore saved margin settings (fall back to 2.5cm defaults)
        marginLeft   = data.marginLeft   ?? 2.5;
        marginRight  = data.marginRight  ?? 2.5;
        marginTop    = data.marginTop    ?? 2.5;
        marginBottom = data.marginBottom ?? 2.5;
        fitAllImageBlocks();
      }
    } catch (e: any) {
      editorError = e.message;
    }
  }

  // --- List Actions ---
  async function deleteTemplate(id: number) {
    if (!confirm(t('pdf_builder.confirm_loeschen'))) return;
    try {
      await pdfTemplateApi.delete(id);
      await loadList();
    } catch (e: any) {
      listError = e.message;
    }
  }

  async function downloadPdfFromList(templateId: number, invoiceId: number) {
    listGenerating = { ...listGenerating, [templateId]: true };
    listGenError = '';
    try {
      const fullTemplate = await pdfTemplateApi.get(templateId);
      const blob = await pdfTemplateApi.previewDraft(fullTemplate, invoiceId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rechnung-${invoiceId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      listGenError = e.message;
    } finally {
      listGenerating = { ...listGenerating, [templateId]: false };
    }
  }

  // --- Editor Actions ---
  // Auto-height applies to all block types except 'image' and 'line'
  function isAutoHeight(type: PdfBlockDto['type']): boolean {
    return type !== 'image' && type !== 'line';
  }

  function addBlock(type: PdfBlockDto['type']) {
    const meta = ALL_BLOCK_TYPES.find(bt => bt.type === type)!;
    const newBlock: PdfBlockDto = {
      id: crypto.randomUUID(),
      type,
      x: Math.round((pageWidth - meta.defaultW) / 2),
      y: Math.round(pageHeight * 0.15 + template.blocks.length * 30),
      width: meta.defaultW,
      height: meta.defaultH,
      fontSize: 10,
      fontColor: '#1c1b18',
      fontWeight: 'normal',
    };
    if (type === 'free-text') newBlock.content = '';
    if (type === 'lines-table') {
      newBlock.showHeader = true;
      newBlock.columnAlignments = { pos: 'center', qty: 'right', price: 'right', total: 'right' };
    }
    if (type === 'image') newBlock.lockAspectRatio = true;
    if (type === 'line') {
      newBlock.lineThickness = 1;
      newBlock.lineColor = '#1c1b18';
      newBlock.lineDirection = 'horizontal';
    }
    // Compute initial height from content for auto-height blocks
    if (isAutoHeight(type)) {
      const computedH = computeBlockContentHeight(newBlock, SAMPLE_INVOICE);
      newBlock.height = Math.max(Math.ceil(computedH), 8);
    }
    if (defaultFontFamily && type !== 'image' && type !== 'line') {
      newBlock.fontFamily = defaultFontFamily;
    }
    template.blocks = [...template.blocks, newBlock];
    selectedBlockId = newBlock.id;
    if (type === 'image') fitAllImageBlocks();
  }

  function deleteBlock(id: string) {
    template.blocks = template.blocks.filter(b => b.id !== id);
    if (selectedBlockId === id) selectedBlockId = null;
  }

  function updateBlock(id: string, updates: Partial<PdfBlockDto>) {
    template.blocks = template.blocks.map(b =>
      b.id === id ? { ...b, ...updates } : b
    );
  }

  async function saveTemplate() {
    saving = true;
    editorError = '';
    const withMargins = {
      ...template,
      marginLeft,
      marginRight,
      marginTop,
      marginBottom,
    };
    try {
      if (template.id) {
        template = await pdfTemplateApi.update(template.id, withMargins);
      } else {
        template = await pdfTemplateApi.create(withMargins);
        // Navigate to the edit URL so future saves are updates
        push(`/pdf-templates/${template.id}`);
      }
    } catch (e: any) {
      editorError = e.message;
    } finally {
      saving = false;
    }
  }

  // --- Logo Upload ---
  function handleLogoUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    // Reset so the same file can be re-selected after replace
    input.value = '';
    const mimeType = file.type || (file.name.endsWith('.svg') ? 'image/svg+xml' : 'image/png');
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      template.logoData = dataUrl.split(',')[1];
      template.logoMimeType = mimeType;
      fitAllImageBlocks();
    };
    reader.readAsDataURL(file);
  }

  function formatDate(s: string): string {
    return fmtDate(s, getSettings().dateFormat);
  }

  function formatCurrency(amount: number): string {
    const locale = getSettings().numberFormat;
    return amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  function formatNumber(n: number): string {
    const locale = getSettings().numberFormat;
    return n % 1 === 0 ? String(n) : n.toLocaleString(locale, { maximumFractionDigits: 3 });
  }

  function getUnitLabel(code: string): string {
    return UNIT_CODES[code] ?? code;
  }

  function getPaymentMeansLabel(code: string): string {
    return PAYMENT_MEANS_CODES[code] ?? code;
  }

  function fitAllImageBlocks() {
    if (!template.logoData || !template.logoMimeType) return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        const ratio = img.naturalHeight / img.naturalWidth;
        template.blocks = template.blocks.map(b => {
          if (b.type === 'image') {
            return { ...b, height: Math.round(b.width * ratio) };
          }
          return b;
        });
      }
    };
    img.src = `data:${template.logoMimeType};base64,${template.logoData}`;
  }

  function removeLogo() {
    template.logoData = undefined;
    template.logoMimeType = undefined;
  }

  // --- Custom Fonts ---
  async function handleFontUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const name = extractFontName(buffer) ?? file.name.replace(/\.[^.]+$/, '');
    const base64 = arrayBufferToBase64(buffer);
    const font: CustomFontDto = { name, data: base64, mimeType: file.type || 'font/ttf' };
    const existing = template.customFonts ?? [];
    template.customFonts = [...existing.filter(f => f.name !== name), font];
    input.value = '';
  }

  async function handleFontReplaceRegular(fontName: string, e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    template.customFonts = (template.customFonts ?? []).map(f =>
      f.name === fontName ? { ...f, data: base64, mimeType: file.type || 'font/ttf' } : f
    );
    input.value = '';
  }

  async function handleFontBoldUpload(fontName: string, e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    template.customFonts = (template.customFonts ?? []).map(f =>
      f.name === fontName ? { ...f, dataBold: base64 } : f
    );
    input.value = '';
  }

  function applyFontToAll(fontName: string) {
    template.blocks = template.blocks.map(b =>
      b.type === 'image' || b.type === 'line' ? b : { ...b, fontFamily: fontName }
    );
    defaultFontFamily = fontName;
  }

  function removeFontBold(fontName: string) {
    template.customFonts = (template.customFonts ?? []).map(f =>
      f.name === fontName ? { ...f, dataBold: undefined } : f
    );
  }

  function removeFont(name: string) {
    template.customFonts = (template.customFonts ?? []).filter(f => f.name !== name);
    // Clear fontFamily on blocks that used this font
    template.blocks = template.blocks.map(b => b.fontFamily === name ? { ...b, fontFamily: undefined } : b);
  }

  // --- Drag & Drop ---
  function onBlockMouseDown(e: MouseEvent, blockId: string) {
    if ((e.target as HTMLElement).classList.contains('rh')) return;
    e.preventDefault();
    const block = template.blocks.find(b => b.id === blockId);
    if (!block) return;
    // Defensive cleanup: remove stale listeners from missed mouseup
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
    selectedBlockId = blockId;
    dragging = true;
    dragBlockId = blockId;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragBlockStartX = block.x;
    dragBlockStartY = block.y;
    window.addEventListener('mousemove', onDragMove);
    window.addEventListener('mouseup', onDragEnd);
  }

  function onDragMove(e: MouseEvent) {
    if (!dragging || !dragBlockId) return;
    if (e.buttons === 0) { onDragEnd(); return; }
    const dx = (e.clientX - dragStartX) / canvasScale;
    const dy = (e.clientY - dragStartY) / canvasScale;
    let newX = Math.round(dragBlockStartX + dx);
    let newY = Math.round(dragBlockStartY + dy);
    // Clamp to page bounds
    const block = template.blocks.find(b => b.id === dragBlockId);
    if (block) {
      const blockH = isAutoHeight(block.type) ? Math.max(Math.ceil(computeBlockContentHeight(block, previewInvoice)), 8) : block.height;
      newX = Math.max(0, Math.min(newX, pageWidth - block.width));
      newY = Math.max(0, Math.min(newY, pageHeight - blockH));
      // Snap to guide lines
      const snap = snapToGuides(newX, newY, block.width, blockH);
      newX = snap.x;
      newY = snap.y;
      snappingGuideIds = snap.snappedIds;
      // Snap to other blocks
      const blockSnap = snapToBlocks(newX, newY, block.width, blockH, dragBlockId!);
      newX = blockSnap.x;
      newY = blockSnap.y;
      snappingBlockIds = blockSnap.snappedIds;
    }
    updateBlock(dragBlockId, { x: newX, y: newY });
  }

  function onDragEnd() {
    dragging = false;
    dragBlockId = null;
    snappingGuideIds = new Set();
    snappingBlockIds = new Set();
    window.removeEventListener('mousemove', onDragMove);
    window.removeEventListener('mouseup', onDragEnd);
  }

  // --- Resize ---
  function onResizeMouseDown(e: MouseEvent, blockId: string, dir: ResizeDir) {
    e.preventDefault();
    e.stopPropagation();
    const block = template.blocks.find(b => b.id === blockId);
    if (!block) return;
    // Defensive cleanup: remove stale listeners from missed mouseup
    window.removeEventListener('mousemove', onResizeMove);
    window.removeEventListener('mouseup', onResizeEnd);
    selectedBlockId = blockId;
    resizing = true;
    resizeBlockId = blockId;
    resizeDir = dir;
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    resizeBlockStartW = block.width;
    resizeBlockStartH = block.height;
    resizeBlockStartX = block.x;
    resizeBlockStartY = block.y;
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeEnd);
  }

  function onResizeMove(e: MouseEvent) {
    if (!resizing || !resizeBlockId) return;
    if (e.buttons === 0) { onResizeEnd(); return; }
    const block = template.blocks.find(b => b.id === resizeBlockId);
    if (!block) return;
    const dx = (e.clientX - resizeStartX) / canvasScale;
    const dy = (e.clientY - resizeStartY) / canvasScale;

    let newX = resizeBlockStartX;
    let newY = resizeBlockStartY;
    let newW = resizeBlockStartW;
    let newH = resizeBlockStartH;
    const autoH = isAutoHeight(block.type);

    // East/West affect x and/or width
    if (resizeDir.includes('e')) newW = Math.max(20, Math.round(resizeBlockStartW + dx));
    if (resizeDir.includes('w')) {
      const dw = Math.min(dx, resizeBlockStartW - 20);
      newX = Math.round(resizeBlockStartX + dw);
      newW = Math.round(resizeBlockStartW - dw);
    }
    // South/North affect y and/or height — only for non-auto-height blocks
    if (!autoH) {
      if (resizeDir.includes('s')) newH = Math.max(8, Math.round(resizeBlockStartH + dy));
      if (resizeDir.includes('n')) {
        const dh = Math.min(dy, resizeBlockStartH - 8);
        newY = Math.round(resizeBlockStartY + dh);
        newH = Math.round(resizeBlockStartH - dh);
      }
    }

    // Lock aspect ratio (image default: locked)
    if (block.type === 'image' && (block.lockAspectRatio ?? true) && resizeBlockStartW > 0) {
      const ratio = resizeBlockStartH / resizeBlockStartW;
      if (resizeDir === 'n' || resizeDir === 's') {
        // Pure vertical drag — derive width from height
        newW = Math.max(20, Math.round(newH / ratio));
      } else {
        // All other directions — derive height from width
        newH = Math.max(8, Math.round(newW * ratio));
        if (resizeDir.includes('n')) newY = resizeBlockStartY + resizeBlockStartH - newH;
        if (resizeDir.includes('w')) newX = resizeBlockStartX + resizeBlockStartW - newW;
      }
    }

    // Snap moving edges to guide lines (including page borders)
    const guides = getGuideLines();
    const allGuides = [
      ...guides,
      { id: '__page_left',   orientation: 'vertical'   as const, position: 0,          locked: true },
      { id: '__page_right',  orientation: 'vertical'   as const, position: pageWidth,   locked: true },
      { id: '__page_top',    orientation: 'horizontal' as const, position: 0,          locked: true },
      { id: '__page_bottom', orientation: 'horizontal' as const, position: pageHeight,  locked: true },
    ];
    for (const g of allGuides) {
      if (g.orientation === 'vertical') {
        if (resizeDir.includes('e')) {
          if (Math.abs(newX + newW - g.position) < SNAP_THRESHOLD) newW = g.position - newX;
        }
        if (resizeDir.includes('w')) {
          if (Math.abs(newX - g.position) < SNAP_THRESHOLD) {
            const right = resizeBlockStartX + resizeBlockStartW;
            newX = g.position;
            newW = right - newX;
          }
        }
      } else {
        if (resizeDir.includes('s')) {
          if (Math.abs(newY + newH - g.position) < SNAP_THRESHOLD) newH = g.position - newY;
        }
        if (resizeDir.includes('n')) {
          if (Math.abs(newY - g.position) < SNAP_THRESHOLD) {
            const bottom = resizeBlockStartY + resizeBlockStartH;
            newY = g.position;
            newH = bottom - newY;
          }
        }
      }
    }

    // Snap moving horizontal edges to other blocks' left/right bounds
    {
      const others = template.blocks
        .filter(b => b.id !== resizeBlockId)
        .map(b => ({ id: b.id, x: b.x, width: b.width }));
      const newSnapped = new Set<string>();
      if (resizeDir.includes('e')) {
        const snap = snapEdgeToBlockBounds(newX + newW, others, SNAP_THRESHOLD);
        if (snap.snappedId !== null) { newW = Math.max(20, snap.value - newX); newSnapped.add(snap.snappedId); }
      }
      if (resizeDir.includes('w')) {
        const right = resizeBlockStartX + resizeBlockStartW;
        const snap = snapEdgeToBlockBounds(newX, others, SNAP_THRESHOLD);
        if (snap.snappedId !== null) { newX = snap.value; newW = Math.max(20, right - newX); newSnapped.add(snap.snappedId); }
      }
      snappingBlockIds = newSnapped;
    }

    // Clamp to page bounds
    newX = Math.max(0, newX);
    newY = Math.max(0, newY);
    newW = Math.min(newW, pageWidth - newX);
    newH = Math.min(newH, pageHeight - newY);

    updateBlock(resizeBlockId, { x: newX, y: newY, width: newW, height: newH });
  }

  function onResizeEnd() {
    resizing = false;
    resizeBlockId = null;
    snappingBlockIds = new Set();
    window.removeEventListener('mousemove', onResizeMove);
    window.removeEventListener('mouseup', onResizeEnd);
  }

  function onCanvasClick() {
    selectedBlockId = null;
    activeGuideId = null;
    guideEditId = null;
  }

  // --- Guide Lines ---
  function getGuideLines(): GuideLineDto[] {
    return template.guideLines ?? [];
  }

  function setGuideLines(lines: GuideLineDto[]) {
    template.guideLines = lines;
    // trigger reactivity
    template = { ...template };
  }

  function addGuideLine(orientation: 'horizontal' | 'vertical') {
    const pos = orientation === 'horizontal' ? Math.round(pageHeight / 2) : Math.round(pageWidth / 2);
    const newGuide: GuideLineDto = {
      id: crypto.randomUUID(),
      orientation,
      position: pos,
      locked: false,
    };
    setGuideLines([...getGuideLines(), newGuide]);
    activeGuideId = newGuide.id;
  }

  function deleteGuideLine(id: string) {
    setGuideLines(getGuideLines().filter(g => g.id !== id));
    if (activeGuideId === id) activeGuideId = null;
  }

  function toggleGuideLock(id: string) {
    setGuideLines(getGuideLines().map(g => g.id === id ? { ...g, locked: !g.locked } : g));
  }

  function updateGuidePosition(id: string, pos: number) {
    setGuideLines(getGuideLines().map(g => g.id === id ? { ...g, position: pos } : g));
  }

  function onGuideMouseDown(e: MouseEvent, guide: GuideLineDto) {
    if (guide.locked) return;
    e.preventDefault();
    e.stopPropagation();
    activeGuideId = guide.id;
    guideEditId = null; // close any open edit; will re-open if this turns out to be a click
    // Defensive cleanup
    window.removeEventListener('mousemove', onGuideDragMove);
    window.removeEventListener('mouseup', onGuideDragEnd);
    draggingGuide = true;
    guideDragOrientation = guide.orientation;
    guideDragStartPos = guide.position;
    guideDragStartMouse = guide.orientation === 'horizontal' ? e.clientY : e.clientX;
    guideDragTotalMovement = 0;
    guideDragMouseStartX = e.clientX;
    guideDragMouseStartY = e.clientY;
    window.addEventListener('mousemove', onGuideDragMove);
    window.addEventListener('mouseup', onGuideDragEnd);
  }

  function onGuideDragMove(e: MouseEvent) {
    if (!draggingGuide || !activeGuideId) return;
    if (e.buttons === 0) { onGuideDragEnd(); return; }
    guideDragTotalMovement = Math.abs(e.clientX - guideDragMouseStartX) + Math.abs(e.clientY - guideDragMouseStartY);
    const delta = guideDragOrientation === 'horizontal'
      ? (e.clientY - guideDragStartMouse) / canvasScale
      : (e.clientX - guideDragStartMouse) / canvasScale;
    const maxPos = guideDragOrientation === 'horizontal' ? pageHeight : pageWidth;
    const newPos = Math.round(Math.max(0, Math.min(guideDragStartPos + delta, maxPos)));
    updateGuidePosition(activeGuideId, newPos);
  }

  function onGuideDragEnd() {
    const wasClick = guideDragTotalMovement < 3;
    const guideId = activeGuideId;
    draggingGuide = false;
    window.removeEventListener('mousemove', onGuideDragMove);
    window.removeEventListener('mouseup', onGuideDragEnd);
    // If barely moved, treat as click → open inline edit
    if (wasClick && guideId) {
      const guide = getGuideLines().find(g => g.id === guideId);
      if (guide && !guide.locked) {
        startGuideEdit(guide);
      }
    }
  }

  function startGuideEdit(guide: GuideLineDto) {
    guideEditId = guide.id;
    // Convert stored pts → signed display cm (negative = from opposite side)
    const cm = positionToGuide(guide.position, guide.orientation, pageWidth, pageHeight);
    guideEditValue = cm.toFixed(2);
  }

  function commitGuideEdit() {
    if (guideEditId) {
      const val = Number(guideEditValue);
      if (!isNaN(val)) {
        const guide = getGuideLines().find(g => g.id === guideEditId);
        if (guide) {
          const pos = guideToPosition(val, guide.orientation, pageWidth, pageHeight);
          const maxPos = guide.orientation === 'horizontal' ? pageHeight : pageWidth;
          // No Math.round — preserve floating-point accuracy so 2.00cm stays 2.00cm
          updateGuidePosition(guideEditId, Math.max(0, Math.min(pos, maxPos)));
        }
      }
    }
    guideEditId = null;
  }

  const SNAP_THRESHOLD = 8;

  function snapToGuides(x: number, y: number, w: number, h: number): { x: number; y: number; snappedIds: Set<string> } {
    const guides = getGuideLines();
    const allGuides = [
      ...guides,
      { id: '__page_left',   orientation: 'vertical'   as const, position: 0,          locked: true },
      { id: '__page_right',  orientation: 'vertical'   as const, position: pageWidth,   locked: true },
      { id: '__page_top',    orientation: 'horizontal' as const, position: 0,          locked: true },
      { id: '__page_bottom', orientation: 'horizontal' as const, position: pageHeight,  locked: true },
    ];
    const snapped = new Set<string>();
    let sx = x, sy = y;

    for (const g of allGuides) {
      if (g.orientation === 'horizontal') {
        // Check top, center, bottom edges
        const edges = [y, y + h / 2, y + h];
        for (const edge of edges) {
          if (Math.abs(edge - g.position) < SNAP_THRESHOLD) {
            sy = g.position - (edge - y);
            snapped.add(g.id);
            break;
          }
        }
      } else {
        // Check left, center, right edges
        const edges = [x, x + w / 2, x + w];
        for (const edge of edges) {
          if (Math.abs(edge - g.position) < SNAP_THRESHOLD) {
            sx = g.position - (edge - x);
            snapped.add(g.id);
            break;
          }
        }
      }
    }
    return { x: sx, y: sy, snappedIds: snapped };
  }

  function snapToBlocks(x: number, y: number, w: number, h: number, excludeId: string): { x: number; y: number; snappedIds: Set<string> } {
    const lineGap = 0;
    const others = template.blocks.map(b => {
      const bh = isAutoHeight(b.type) ? Math.max(Math.ceil(computeBlockContentHeight(b, previewInvoice)), 8) : b.height;
      const bLineGap = 0;
      return { id: b.id, x: b.x, y: b.y, width: b.width, height: bh, lineGap: bLineGap };
    });
    return snapBlockToOthers({ id: excludeId, x, y, width: w, height: h }, others, SNAP_THRESHOLD, lineGap);
  }

  // --- Preview ---
  async function openPreview() {
    if (!selectedInvoiceId) return;
    previewOpen = true;
    previewLoading = true;
    try {
      const blob = await pdfTemplateApi.previewDraft(template, selectedInvoiceId);
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
      previewBlobUrl = URL.createObjectURL(blob);
    } catch (e: any) {
      editorError = e.message;
      previewOpen = false;
    } finally {
      previewLoading = false;
    }
  }

  function closePreview() {
    previewOpen = false;
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      previewBlobUrl = null;
    }
  }

  // --- Zoom ---
  function adjustZoom(delta: number) {
    canvasScale = Math.max(0.3, Math.min(2.5, Math.round((canvasScale + delta) * 100) / 100));
  }

  function zoomToPageWidth() {
    if (!canvasWrapEl) return;
    const available = canvasWrapEl.clientWidth - 48; // 24px padding each side
    canvasScale = Math.max(0.3, Math.min(2.5, Math.round((available / pageWidth) * 100) / 100));
  }

  function zoomToPageHeight() {
    if (!canvasWrapEl) return;
    const available = canvasWrapEl.clientHeight - 48;
    canvasScale = Math.max(0.3, Math.min(2.5, Math.round((available / pageHeight) * 100) / 100));
  }

  // --- ZUGFeRD Export ---
  async function handleZugferdExport() {
    if (!template.id || !selectedInvoiceId) return;
    zugferdExporting = true;
    editorError = '';
    try {
      const blob = await pdfTemplateApi.exportZugferd(template.id, selectedInvoiceId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rechnung-ZUGFeRD.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      editorError = e.message;
    } finally {
      zugferdExporting = false;
    }
  }
</script>

<!-- ===================== LIST MODE ===================== -->
{#if mode === 'list'}
  <div class="page-header">
    <div class="page-title-group">
      <h1>{t('pdf_builder.list_title')}</h1>
      <p class="subtitle">{t('pdf_builder.list_subtitle')}</p>
    </div>
    <button class="primary" onclick={() => push('/pdf-templates/new')}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      {t('pdf_builder.neue_vorlage')}
    </button>
  </div>

  {#if listError}
    <div class="error-banner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      {listError}
    </div>
  {/if}

  {#if listGenError}
    <div class="error-banner">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      {listGenError}
    </div>
  {/if}

  {#if listLoading}
    <div class="loading-card">
      <div class="loading-pulse"></div>
      <span>{t('pdf_builder.laden')}</span>
    </div>
  {:else if templates.length === 0}
    <div class="empty-state">
      <div class="empty-icon">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <rect x="8" y="13" width="8" height="4" rx="1" stroke-dasharray="2 2"/>
        </svg>
      </div>
      <h2>{t('pdf_builder.noch_keine')}</h2>
      <p>{t('pdf_builder.noch_keine_text')}</p>
      <button class="primary" onclick={() => push('/pdf-templates/new')}>{t('pdf_builder.erste_anlegen')}</button>
    </div>
  {:else}
    <div class="templates-grid">
      {#each templates as tpl, i}
        <div class="template-card" style="animation-delay: {i * 40}ms">
          <div class="card-preview-strip">
            <div class="mini-page">
              {#each tpl.blocks.slice(0, 5) as block}
                <div class="mini-block" style="
                  left: {block.x / (tpl.orientation === 'landscape' ? A4_H : A4_W) * 100}%;
                  top: {block.y / (tpl.orientation === 'landscape' ? A4_W : A4_H) * 100}%;
                  width: {block.width / (tpl.orientation === 'landscape' ? A4_H : A4_W) * 100}%;
                  height: {block.height / (tpl.orientation === 'landscape' ? A4_W : A4_H) * 100}%;
                "></div>
              {/each}
            </div>
          </div>
          <div class="template-name">{tpl.name}</div>
          <div class="template-details">
            <div class="template-detail">
              <span class="detail-key">{t('pdf_builder.format')}</span>
              <span class="detail-val">{tpl.pageSize.toUpperCase()} {tpl.orientation === 'landscape' ? t('pdf_builder.quer') : t('pdf_builder.hoch')}</span>
            </div>
            <div class="template-detail">
              <span class="detail-key">{t('pdf_builder.bloecke')}</span>
              <span class="detail-val">{tpl.blocks.length}</span>
            </div>
          </div>
          {#if listInvoices.length > 0}
            <div class="template-pdf-row">
              <select
                class="template-pdf-select"
                value={listSelectedInvoiceId[tpl.id!] ?? null}
                onchange={(e) => { listSelectedInvoiceId = { ...listSelectedInvoiceId, [tpl.id!]: Number((e.target as HTMLSelectElement).value) || null }; }}
              >
                <option value="">{t('pdf_builder.rechnung_waehlen')}</option>
                {#each listInvoices as inv}
                  <option value={inv.id}>{inv.invoiceNumber}</option>
                {/each}
              </select>
              <button
                class="primary pdf-dl-btn"
                disabled={!listSelectedInvoiceId[tpl.id!] || listGenerating[tpl.id!]}
                onclick={() => downloadPdfFromList(tpl.id!, listSelectedInvoiceId[tpl.id!]!)}
              >
                {#if listGenerating[tpl.id!]}
                  <span class="btn-spinner"></span>
                  {t('pdf_builder.erstellt')}
                {:else}
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/>
                    <line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  {t('pdf_builder.pdf')}
                {/if}
              </button>
            </div>
          {/if}
          <div class="template-actions">
            <button class="ghost" onclick={() => push(`/pdf-templates/${tpl.id}`)}>{t('pdf_builder.bearbeiten')}</button>
            <button class="danger" onclick={() => deleteTemplate(tpl.id!)}>{t('pdf_builder.loeschen')}</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}

<!-- ===================== EDITOR MODE ===================== -->
{:else}
  <!-- Toolbar -->
  <div class="editor-toolbar">
    <button class="ghost toolbar-back" onclick={() => push('/pdf-templates')} aria-label={t('pdf_builder.zurueck')}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
    </button>
    <div class="toolbar-field">
      <input
        type="text"
        bind:value={template.name}
        placeholder={t('pdf_builder.vorlagenname_placeholder')}
        class="toolbar-name"
      />
    </div>
    <!-- Zoom controls -->
    <div class="toolbar-zoom">
      <button class="zoom-btn ghost" onclick={() => adjustZoom(-0.1)} aria-label={t('pdf_builder.verkleinern')}>−</button>
      <span class="zoom-display">{Math.round(canvasScale * 100)}%</span>
      <button class="zoom-btn ghost" onclick={() => adjustZoom(0.1)} aria-label={t('pdf_builder.vergroessern')}>+</button>
      <div class="zoom-divider"></div>
      <button class="zoom-btn zoom-btn-preset ghost" onclick={zoomToPageWidth} title={t('pdf_builder.auf_seitenbreite')} aria-label={t('pdf_builder.auf_seitenbreite')}>B</button>
      <button class="zoom-btn zoom-btn-preset ghost" onclick={zoomToPageHeight} title={t('pdf_builder.auf_seitenhoehe')} aria-label={t('pdf_builder.auf_seitenhoehe')}>H</button>
    </div>
    <div class="toolbar-actions">
      <button class="ghost" onclick={saveTemplate} disabled={saving || !template.name}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
          <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
        </svg>
        {saving ? t('pdf_builder.speichern_laufend') : t('pdf_builder.speichern')}
      </button>
      {#if selectedInvoiceId}
        <button
          class="ghost"
          onclick={openPreview}
          title={t('pdf_builder.vorschau_oeffnen')}
          disabled={previewLoading}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          {t('pdf_builder.vorschau')}
        </button>
        <button
          class="primary"
          onclick={handleZugferdExport}
          title={t('pdf_builder.zugferd_title')}
          disabled={zugferdExporting}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          {zugferdExporting ? t('pdf_builder.zugferd_wird_erstellt') : t('pdf_builder.zugferd_pdf')}
        </button>
      {/if}
    </div>
  </div>

  {#if editorError}
    <div class="error-banner" style="margin-bottom: 0.75rem; white-space: pre-wrap;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="flex-shrink: 0; margin-top: 1px;">
        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      {editorError}
    </div>
  {/if}

  <div class="editor-layout">
    <!-- LEFT: Block Palette -->
    <div class="editor-panel palette-panel">
      <div class="panel-header">{t('pdf_builder.bausteine')}</div>
      {#each PALETTE_GROUPS as group}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="palette-group-header" onclick={() => toggleGroup(group.key)}>
          <svg class="group-chevron" class:expanded={expandedGroups[group.key]} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          <span>{group.label}</span>
        </div>
        {#if expandedGroups[group.key]}
          <div class="palette-items">
            {#each group.items as bt}
              <button class="palette-btn" onclick={() => addBlock(bt.type)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  {#each bt.icon.split('|') as segment}
                    <path d="{segment}"/>
                  {/each}
                </svg>
                <span>{bt.label}</span>
              </button>
            {/each}
          </div>
        {/if}
      {/each}

      <div class="panel-divider"></div>
      <div class="panel-header">{t('pdf_builder.bild')}</div>
      {#if template.logoData}
        <div class="logo-preview">
          <img src="data:{template.logoMimeType};base64,{template.logoData}" alt="Bild" />
          <div class="logo-actions">
            <label class="ghost logo-action-btn" title={t('pdf_builder.bild_ersetzen')} aria-label={t('pdf_builder.bild_ersetzen')}>
              <input type="file" accept="image/png,image/jpeg,image/svg+xml,.svg" onchange={handleLogoUpload} class="sr-only" />
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </label>
            <button class="ghost logo-action-btn" onclick={removeLogo} aria-label={t('pdf_builder.bild_entfernen')} title={t('pdf_builder.bild_entfernen')}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
      {:else}
        <label class="upload-area">
          <input type="file" accept="image/png,image/jpeg,image/svg+xml,.svg" onchange={handleLogoUpload} class="sr-only" />
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span>{t('pdf_builder.png_jpeg_svg')}</span>
        </label>
      {/if}

      <div class="panel-divider"></div>
      <div class="panel-header">{t('pdf_builder.schriften')}</div>
      {#if template.customFonts && template.customFonts.length > 0}
        <div class="font-list">
          {#each template.customFonts as font}
            <div class="font-list-item">
              <div class="font-list-info">
                <span class="font-list-name">{font.name}</span>
                <div class="font-list-weights">
                  <label class="font-replace-label" title={t('pdf_builder.regular_ersetzen')}>
                    <input type="file" accept=".ttf,.otf,font/ttf,font/otf" onchange={(e) => handleFontReplaceRegular(font.name, e)} class="sr-only" />
                    <span class="font-weight-tag font-weight-tag-replaceable">R</span>
                  </label>
                  {#if font.dataBold}
                    <label class="font-replace-label" title={t('pdf_builder.fett_ersetzen')}>
                      <input type="file" accept=".ttf,.otf,font/ttf,font/otf" onchange={(e) => handleFontBoldUpload(font.name, e)} class="sr-only" />
                      <span class="font-weight-tag font-weight-tag-bold font-weight-tag-replaceable">F</span>
                    </label>
                    <button class="ghost guide-list-btn" onclick={() => removeFontBold(font.name)} aria-label={t('pdf_builder.fett_entfernen')} title={t('pdf_builder.fett_entfernen')}>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  {:else}
                    <label class="font-bold-upload" title={t('pdf_builder.fett_hochladen')}>
                      <input type="file" accept=".ttf,.otf,font/ttf,font/otf" onchange={(e) => handleFontBoldUpload(font.name, e)} class="sr-only" />
                      <span class="font-weight-tag font-weight-tag-add">+F</span>
                    </label>
                  {/if}
                </div>
              </div>
              <button class="ghost guide-list-btn font-apply-btn" onclick={() => applyFontToAll(font.name)} title={t('pdf_builder.auf_alle_anwenden')} aria-label={t('pdf_builder.auf_alle_anwenden')}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M2 5h12a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H2"/>
                  <path d="M11 9v9"/>
                  <rect x="8" y="16" width="6" height="5" rx="1"/>
                </svg>
              </button>
              <button class="ghost guide-list-btn" onclick={() => removeFont(font.name)} aria-label={t('pdf_builder.schrift_entfernen')}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}
      <label class="upload-area upload-area-small">
        <input type="file" accept=".ttf,.otf,font/ttf,font/otf" onchange={handleFontUpload} class="sr-only" />
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
        </svg>
        <span>{t('pdf_builder.ttf_otf')}</span>
      </label>

      <div class="panel-divider"></div>
      <div class="panel-header">{t('pdf_builder.hilfslinien')}</div>
      <div class="overlay-toggles">
        <label class="overlay-toggle" class:overlay-hidden={!showMargins}>
          <input type="checkbox" bind:checked={showMargins} class="prop-checkbox sr-only" />
          <span class="overlay-eye">
            {#if showMargins}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            {:else}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            {/if}
          </span>
          <span class="overlay-swatch" style="background: rgba(59,130,246,0.3)"></span>
          {t('pdf_builder.raender')}
        </label>
        <label class="overlay-toggle" class:overlay-hidden={!showWindow}>
          <input type="checkbox" bind:checked={showWindow} class="prop-checkbox sr-only" />
          <span class="overlay-eye">
            {#if showWindow}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            {:else}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            {/if}
          </span>
          <span class="overlay-swatch" style="background: rgba(34,197,94,0.25)"></span>
          {t('pdf_builder.fensterposition')}
        </label>
        <label class="overlay-toggle" class:overlay-hidden={!showFoldMarks}>
          <input type="checkbox" bind:checked={showFoldMarks} class="prop-checkbox sr-only" />
          <span class="overlay-eye">
            {#if showFoldMarks}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            {:else}
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
            {/if}
          </span>
          <span class="overlay-swatch" style="background: rgba(249,115,22,0.4)"></span>
          {t('pdf_builder.faltmarken')}
        </label>
      </div>
      {#if showMargins}
        <div class="margin-inputs">
          <div class="margin-row">
            <label>
              <span class="margin-label">{t('pdf_builder.oben')}</span>
              <input type="number" min="0" max="10" step="0.1" bind:value={marginTop} class="margin-input" />
              <span class="margin-unit">cm</span>
            </label>
          </div>
          <div class="margin-row">
            <label>
              <span class="margin-label">{t('pdf_builder.links')}</span>
              <input type="number" min="0" max="10" step="0.1" bind:value={marginLeft} class="margin-input" />
              <span class="margin-unit">cm</span>
            </label>
          </div>
          <div class="margin-row">
            <label>
              <span class="margin-label">{t('pdf_builder.rechts')}</span>
              <input type="number" min="0" max="10" step="0.1" bind:value={marginRight} class="margin-input" />
              <span class="margin-unit">cm</span>
            </label>
          </div>
          <div class="margin-row">
            <label>
              <span class="margin-label">{t('pdf_builder.unten')}</span>
              <input type="number" min="0" max="10" step="0.1" bind:value={marginBottom} class="margin-input" />
              <span class="margin-unit">cm</span>
            </label>
          </div>
        </div>
      {/if}

      <div class="panel-divider"></div>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="panel-header panel-header-toggle" onclick={() => showCustomGuides = !showCustomGuides}>
        <svg class="group-chevron" class:expanded={showCustomGuides} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
        {t('pdf_builder.eigene_hilfslinien')}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span
          class="guide-visibility-btn"
          onclick={(e) => { e.stopPropagation(); showGuidesOnCanvas = !showGuidesOnCanvas; }}
          title={showGuidesOnCanvas ? t('pdf_builder.hilfslinien_ausblenden') : t('pdf_builder.hilfslinien_einblenden')}
          aria-label={showGuidesOnCanvas ? t('pdf_builder.hilfslinien_ausblenden') : t('pdf_builder.hilfslinien_einblenden')}
        >
          {#if showGuidesOnCanvas}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
          {:else}
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>
            </svg>
          {/if}
        </span>
      </div>
      {#if showCustomGuides}
      <div class="guide-add-btns">
        <button class="ghost guide-add-btn" onclick={() => addGuideLine('horizontal')}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          {t('pdf_builder.horizontal')}
        </button>
        <button class="ghost guide-add-btn" onclick={() => addGuideLine('vertical')}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
          </svg>
          {t('pdf_builder.vertikal')}
        </button>
      </div>
      {#if getGuideLines().length > 0}
        <div class="guide-list">
          {#each getGuideLines() as guide}
            <div class="guide-list-item" class:active={guide.id === activeGuideId}>
              <span class="guide-list-label">
                {#if guide.orientation === 'horizontal'}
                  {@const cm = positionToGuide(guide.position, 'horizontal', pageWidth, pageHeight)}
                  H {cm < 0 ? '↓' : '↑'}{Math.abs(cm).toFixed(2)}cm
                {:else}
                  {@const cm = positionToGuide(guide.position, 'vertical', pageWidth, pageHeight)}
                  V {cm < 0 ? '←' : '→'}{Math.abs(cm).toFixed(2)}cm
                {/if}
              </span>
              <button class="ghost guide-list-btn" onclick={() => toggleGuideLock(guide.id)} aria-label={guide.locked ? t('pdf_builder.entsperren') : t('pdf_builder.sperren')}>
                {#if guide.locked}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                {:else}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>
                  </svg>
                {/if}
              </button>
              <button class="ghost guide-list-btn" onclick={() => deleteGuideLine(guide.id)} aria-label={t('pdf_builder.loeschen')}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          {/each}
        </div>
      {/if}
      {/if}
    </div>

    <!-- CENTER: Canvas -->
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
    <div
      class="editor-canvas-wrap"
      bind:this={canvasWrapEl}
      tabindex="0"
      role="region"
      aria-label={t('pdf_builder.leinwand_label')}
      onkeydown={(e) => {
        // Never intercept keystrokes when focus is inside an input/textarea
        const tag = (e.target as HTMLElement).tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        if (!selectedBlockId) return;
        if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) {
          e.preventDefault();
          const step = e.shiftKey ? 10 : 1;
          const b = template.blocks.find(bl => bl.id === selectedBlockId);
          if (!b) return;
          let nx = b.x, ny = b.y;
          if (e.key === 'ArrowLeft') nx = Math.max(0, b.x - step);
          if (e.key === 'ArrowRight') nx = Math.min(pageWidth - b.width, b.x + step);
          if (e.key === 'ArrowUp') ny = Math.max(0, b.y - step);
          if (e.key === 'ArrowDown') ny = Math.min(pageHeight - (isAutoHeight(b.type) ? 8 : b.height), b.y + step);
          updateBlock(selectedBlockId, { x: nx, y: ny });
        }
      }}
    >
      <div class="canvas-scroll">
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="canvas-outer"
          style="width: {pageWidth * canvasScale}px; height: {pageHeight * canvasScale}px;"
          onclick={onCanvasClick}
        >
          <div
            class="canvas-page"
            style="width: {pageWidth}px; height: {pageHeight}px; transform: scale({canvasScale}); transform-origin: top left;"
          >
            <!-- DIN 5008 Overlays -->
            {#if showMargins}
              <div
                class="overlay overlay-margins"
                style="
                  left: {marginLeft * CM_TO_PTS}px;
                  top: {marginTop * CM_TO_PTS}px;
                  width: {pageWidth - (marginLeft + marginRight) * CM_TO_PTS}px;
                  height: {pageHeight - (marginTop + marginBottom) * CM_TO_PTS}px;
                "
              ></div>
            {/if}
            {#if showWindow}
              <div
                class="overlay overlay-window"
                style="
                  left: {DIN.windowLeft}px;
                  top: {DIN.windowTop}px;
                  width: {DIN.windowWidth}px;
                  height: {DIN.windowHeight}px;
                "
              >
                <span class="overlay-label overlay-label-green">{t('pdf_builder.overlay_fenster')}</span>
              </div>
            {/if}
            {#if showFoldMarks}
              <div class="overlay overlay-foldmark" style="top: {DIN.foldMark1}px;">
                <span class="overlay-label overlay-label-orange">{t('pdf_builder.overlay_falz1')}</span>
              </div>
              <div class="overlay overlay-foldmark overlay-punchmark" style="top: {DIN.punchMark}px;">
                <span class="overlay-label overlay-label-orange">{t('pdf_builder.overlay_lochmarke')}</span>
              </div>
              <div class="overlay overlay-foldmark" style="top: {DIN.foldMark2}px;">
                <span class="overlay-label overlay-label-orange">{t('pdf_builder.overlay_falz2')}</span>
              </div>
            {/if}

            <!-- Guide Lines -->
            {#if showGuidesOnCanvas}
              {#each getGuideLines() as guide (guide.id)}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="canvas-guide"
                  class:snapping={snappingGuideIds.has(guide.id)}
                  class:active={guide.id === activeGuideId}
                  class:locked={guide.locked}
                  style="
                    {guide.orientation === 'horizontal'
                      ? `left: 0; top: ${guide.position}px; width: 100%; height: 0;`
                      : `top: 0; left: ${guide.position}px; height: 100%; width: 0;`}
                  "
                  onmousedown={(e) => onGuideMouseDown(e, guide)}
                  onclick={(e) => { e.stopPropagation(); activeGuideId = guide.id; }}
                >
                  {#if guideEditId === guide.id}
                    <input
                      class="guide-edit-input"
                      type="number"
                      step="0.01"
                      bind:value={guideEditValue}
                      bind:this={guideEditInputEl}
                      onblur={commitGuideEdit}
                      onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commitGuideEdit(); if (e.key === 'Escape') { guideEditId = null; } }}
                      onclick={(e) => e.stopPropagation()}
                      style="{guide.orientation === 'horizontal' ? 'left: 4px; top: 2px;' : 'top: 4px; left: 2px;'}"
                    />
                  {/if}
                </div>
              {/each}
            {/if}

            {#each template.blocks as block (block.id)}
              {@const contentH = computeBlockContentHeight(block, previewInvoice)}
              {@const autoH = isAutoHeight(block.type)}
              {@const displayH = autoH ? Math.max(Math.ceil(contentH), 8) : block.height}
              {@const isLeft = block.textAlign === 'left'}
              {@const padL = block.paddingLeft ?? 0}
              {@const padR = block.paddingRight ?? 0}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div
                class="canvas-block"
                class:selected={block.id === selectedBlockId}
                class:block-snap-target={snappingBlockIds.has(block.id)}
                style="
                  left: {block.x}px;
                  top: {block.y}px;
                  width: {block.width}px;
                  height: {displayH}px;
                  font-size: {block.fontSize ?? 10}px;
                  color: {block.fontColor ?? '#1c1b18'};
                  font-weight: {block.fontWeight ?? 'normal'};
                  {block.fontFamily ? `font-family: '${block.fontFamily}', Helvetica, Arial, sans-serif;` : ''}
                "
                onmousedown={(e) => onBlockMouseDown(e, block.id)}
                onclick={(e) => e.stopPropagation()}
              >
                <div class="block-preview-content" style="
                  {block.type === 'line' ? 'display: flex; align-items: center; justify-content: center;' : ''}
                  {(padL > 0 || padR > 0) && block.type !== 'image' && block.type !== 'line' && block.type !== 'lines-table'
                    ? `padding-left: ${padL}px; padding-right: ${padR}px;`
                    : ''}
                ">
                  {#if block.type === 'image'}
                    {#if template.logoData}
                      <img
                        src="data:{template.logoMimeType};base64,{template.logoData}"
                        alt="Bild"
                        class="block-logo-img"
                        style={block.lockAspectRatio === false ? 'width:100%;height:100%;object-fit:fill;' : 'width:100%;height:auto;'}
                      />
                    {:else}
                      <div class="preview-muted">{t('pdf_builder.kein_bild')}</div>
                    {/if}
                  {:else if block.type === 'line'}
                    <div class="preview-line" style="
                      background: {block.lineColor ?? '#1c1b18'};
                      {block.lineDirection === 'vertical'
                        ? `width: ${block.lineThickness ?? 1}px; height: 100%;`
                        : `height: ${block.lineThickness ?? 1}px; width: 100%;`}
                    "></div>
                  {:else if block.content && !['lines-table', 'free-text'].includes(block.type)}
                    <div style="white-space: pre-wrap;">{block.content}</div>
                  {:else if block.type === 'seller-address'}
                    <div>{previewInvoice.seller.name}</div>
                    <div>{previewInvoice.seller.street}</div>
                    <div>{previewInvoice.seller.postalCode} {previewInvoice.seller.city}</div>
                    {#if previewInvoice.seller.vatId}<div class={isLeft ? '' : 'preview-kv-row'}>{#if isLeft}USt-IdNr.: {previewInvoice.seller.vatId}{:else}<span>USt-IdNr.:</span><span>{previewInvoice.seller.vatId}</span>{/if}</div>{/if}
                    {#if previewInvoice.seller.taxNumber}<div class={isLeft ? '' : 'preview-kv-row'}>{#if isLeft}Steuernr.: {previewInvoice.seller.taxNumber}{:else}<span>Steuernr.:</span><span>{previewInvoice.seller.taxNumber}</span>{/if}</div>{/if}
                  {:else if block.type === 'buyer-address'}
                    <div>{previewInvoice.buyer.name}</div>
                    <div>{previewInvoice.buyer.street}</div>
                    <div>{previewInvoice.buyer.postalCode} {previewInvoice.buyer.city}</div>
                  {:else if block.type === 'invoice-title'}
                    <div style="font-size: {(block.fontSize ?? 10) + 4}px; font-weight: {block.fontWeight ?? 'bold'};">Rechnung</div>
                  {:else if block.type === 'invoice-number'}
                    <div class={isLeft ? 'preview-kv-left' : 'preview-kv-row'}><span>Nr.:</span><span>{previewInvoice.invoiceNumber}</span></div>
                  {:else if block.type === 'invoice-date'}
                    <div class={isLeft ? 'preview-kv-left' : 'preview-kv-row'}><span>Datum:</span><span>{formatDate(previewInvoice.invoiceDate)}</span></div>
                  {:else if block.type === 'due-date'}
                    {#if previewInvoice.dueDate}<div class={isLeft ? 'preview-kv-left' : 'preview-kv-row'}><span>Fällig:</span><span>{formatDate(previewInvoice.dueDate)}</span></div>{/if}
                  {:else if block.type === 'buyer-reference'}
                    {#if previewInvoice.buyerReference}<div class={isLeft ? 'preview-kv-left' : 'preview-kv-row'}><span>Referenz:</span><span>{previewInvoice.buyerReference}</span></div>{/if}
                  {:else if block.type === 'invoice-header'}
                    <div class={isLeft ? 'preview-kv-left' : 'preview-kv-row'}><span>Nr.:</span><span>{previewInvoice.invoiceNumber}</span></div>
                    <div class={isLeft ? 'preview-kv-left' : 'preview-kv-row'}><span>Datum:</span><span>{formatDate(previewInvoice.invoiceDate)}</span></div>
                    {#if previewInvoice.dueDate}<div class={isLeft ? 'preview-kv-left' : 'preview-kv-row'}><span>Fällig:</span><span>{formatDate(previewInvoice.dueDate)}</span></div>{/if}
                    {#if previewInvoice.buyerReference}<div class={isLeft ? 'preview-kv-left' : 'preview-kv-row'}><span>Referenz:</span><span>{previewInvoice.buyerReference}</span></div>{/if}
                  {:else if block.type === 'lines-table'}
                    {@const allCols = [
                      { key: 'pos', header: 'Pos', ratio: 0.06 },
                      { key: 'name', header: 'Bezeichnung', ratio: 0.34 },
                      { key: 'qty', header: 'Menge', ratio: 0.1 },
                      { key: 'unit', header: 'Einheit', ratio: 0.1 },
                      { key: 'price', header: 'Einzelpreis', ratio: 0.2 },
                      { key: 'total', header: 'Netto', ratio: 0.2 },
                    ]}
                    {@const visCols = (block.columns && block.columns.length > 0) ? allCols.filter(c => block.columns!.includes(c.key)) : allCols}
                    {@const totalRatio = visCols.reduce((s, c) => s + c.ratio, 0)}
                    {@const tStyle = block.tableStyle ?? 'minimal'}
                    {@const fs = (block.fontSize ?? 10) - 1}
                    {@const rowH = (block.fontSize ?? 10) * (block.lineHeight ?? 1.8)}
                    {@const hdrBg = block.tableHeaderBgColor ?? '#f0f0eb'}
                    {@const useHdrBg = tStyle !== 'compact' && tStyle !== 'elegant'}
                    <div class="preview-table" class:preview-table-grid-outer={tStyle === 'grid'} style="font-size: {fs}px;">
                      {#if block.showHeader !== false}
                        {@const hdrLineColor = block.tableHeaderLineColor ?? (
                          tStyle === 'compact' ? '#a62f24'
                          : tStyle === 'elegant' ? '#555555'
                          : tStyle === 'striped' ? '#bbb9b0'
                          : '#d1cfc7'
                        )}
                        {@const hdrLinePx = tStyle === 'compact' ? '1.5px' : tStyle === 'elegant' ? '1px' : tStyle === 'striped' ? '1px' : '0.5px'}
                        <div class="preview-table-row preview-table-header"
                          class:preview-table-header-striped={tStyle === 'striped'}
                          class:preview-table-header-compact={tStyle === 'compact'}
                          class:preview-table-header-elegant={tStyle === 'elegant'}
                          style="height: {rowH + 4}px; {useHdrBg ? `background: ${hdrBg};` : 'background: transparent;'} border-bottom: {hdrLinePx} solid {hdrLineColor};">
                          {#each visCols as col, i}
                            <span class="preview-table-cell" class:preview-table-cell-vborder={tStyle === 'grid' && i < visCols.length - 1} style="flex: {col.ratio / totalRatio}; justify-content: {alignToJustify(block.columnAlignments?.[col.key as keyof typeof block.columnAlignments] ?? 'left')};">{col.header}</span>
                          {/each}
                        </div>
                      {/if}
                      {#each previewInvoice.lines.slice(0, 4) as line, rowIdx}
                        {@const cellMap: Record<string,string> = { pos: String(line.lineNumber), name: line.itemName, qty: formatNumber(line.quantity), unit: getUnitLabel(line.unitCode), price: formatCurrency(line.netPrice), total: formatCurrency(line.lineNetAmount) }}
                        {@const hdrHex = block.tableHeaderBgColor ?? '#f0f0eb'}
                        {@const modernStripe = tStyle === 'modern' && rowIdx % 2 === 1}
                        <div class="preview-table-row preview-table-data"
                          class:preview-table-row-minimal={tStyle === 'minimal'}
                          class:preview-table-row-grid={tStyle === 'grid'}
                          class:preview-table-row-compact={tStyle === 'compact'}
                          class:preview-table-row-elegant={tStyle === 'elegant'}
                          class:preview-table-stripe={tStyle === 'striped' && rowIdx % 2 === 1}
                          class:preview-table-row-modern={tStyle === 'modern'}
                          style="height: {rowH}px; {modernStripe ? `background: ${hdrHex}22;` : ''}">
                          {#each visCols as col, i}
                            <span class="preview-table-cell" class:preview-table-cell-vborder={tStyle === 'grid' && i < visCols.length - 1} style="flex: {col.ratio / totalRatio}; justify-content: {alignToJustify(block.columnAlignments?.[col.key as keyof typeof block.columnAlignments] ?? 'left')};">{cellMap[col.key]}</span>
                          {/each}
                        </div>
                      {/each}
                      {#if previewInvoice.lines.length > 4}<div class="preview-muted" style="padding: 2px 4px;">…{previewInvoice.lines.length - 4} {t('pdf_builder.weitere')}</div>{/if}
                    </div>
                  {:else if block.type === 'total-net'}
                    <div class={isLeft ? 'preview-kv-left' : 'preview-kv-row'}><span>{previewInvoice.kleinunternehmer ? 'Rechnungssumme:' : 'Nettobetrag:'}</span><span>{formatCurrency(previewInvoice.totalNetAmount ?? 0)}</span></div>
                  {:else if block.type === 'total-tax'}
                    {#if !previewInvoice.kleinunternehmer}<div class={isLeft ? 'preview-kv-left' : 'preview-kv-row'}><span>USt. {previewInvoice.taxRate}%:</span><span>{formatCurrency(previewInvoice.totalTaxAmount ?? 0)}</span></div>{/if}
                  {:else if block.type === 'total-gross'}
                    <div class={isLeft ? 'preview-kv-left' : 'preview-kv-row'}><span>{previewInvoice.kleinunternehmer ? 'Rechnungssumme:' : 'Bruttobetrag:'}</span><span>{formatCurrency(previewInvoice.totalGrossAmount ?? 0)}</span></div>
                  {:else if block.type === 'totals'}
                    {#if previewInvoice.kleinunternehmer}
                      <div class={isLeft ? 'preview-kv-left' : 'preview-kv-row'} style="font-weight:700;"><span>Rechnungssumme:</span><span>{formatCurrency(previewInvoice.totalGrossAmount ?? 0)}</span></div>
                    {:else}
                      <div class={isLeft ? 'preview-kv-left' : 'preview-kv-row'}><span>Nettobetrag:</span><span>{formatCurrency(previewInvoice.totalNetAmount ?? 0)}</span></div>
                      <div class={isLeft ? 'preview-kv-left' : 'preview-kv-row'}><span>USt. {previewInvoice.taxRate}%:</span><span>{formatCurrency(previewInvoice.totalTaxAmount ?? 0)}</span></div>
                      <div class={isLeft ? 'preview-kv-left' : 'preview-kv-row'} style="font-size: {(block.fontSize ?? 10) + 1}px; font-weight:700; border-top:1px solid rgba(0,0,0,0.12); padding-top:1px;"><span>Bruttobetrag:</span><span>{formatCurrency(previewInvoice.totalGrossAmount ?? 0)}</span></div>
                    {/if}
                  {:else if block.type === 'kleinunternehmer-note'}
                    {#if previewInvoice.kleinunternehmer}
                      <div>Gemäß §19 UStG wird keine Umsatzsteuer berechnet.</div>
                    {:else}
                      <div class="preview-muted">§19-Note (nur aktiv bei Kleinunternehmer)</div>
                    {/if}
                  {:else if block.type === 'payment-means'}
                    <div class={isLeft ? 'preview-kv-left' : 'preview-kv-row'}><span>Zahlungsart:</span><span>{getPaymentMeansLabel(previewInvoice.paymentMeansCode)}</span></div>
                  {:else if block.type === 'iban-bic'}
                    {#if previewInvoice.iban}<div class={isLeft ? '' : 'preview-kv-row'}>{#if isLeft}IBAN: {formatIban(previewInvoice.iban)}{:else}<span>IBAN:</span><span>{formatIban(previewInvoice.iban)}</span>{/if}</div>{/if}
                    {#if previewInvoice.bic}<div class={isLeft ? '' : 'preview-kv-row'}>{#if isLeft}BIC: {previewInvoice.bic}{:else}<span>BIC:</span><span>{previewInvoice.bic}</span>{/if}</div>{/if}
                  {:else if block.type === 'payment-terms'}
                    {#if previewInvoice.paymentTerms}<div class={isLeft ? 'preview-kv-left' : 'preview-kv-row'}><span>Zahlungsziel:</span><span>{previewInvoice.paymentTerms}</span></div>{/if}
                  {:else if block.type === 'payment-info'}
                    <div>Zahlungsart: {getPaymentMeansLabel(previewInvoice.paymentMeansCode)}</div>
                    {#if previewInvoice.iban}<div>IBAN: {formatIban(previewInvoice.iban)}</div>{/if}
                    {#if previewInvoice.bic}<div>BIC: {previewInvoice.bic}</div>{/if}
                    {#if previewInvoice.paymentTerms}<div>Zahlungsziel: {previewInvoice.paymentTerms}</div>{/if}
                  {:else if block.type === 'free-text'}
                    <div style="white-space: pre-wrap; text-align: {block.textAlign ?? 'left'};">{block.content || ''}</div>
                  {/if}
                </div>
                {#if block.id === selectedBlockId}
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  {#if !autoH}
                    <div class="rh rh-nw" onmousedown={(e) => onResizeMouseDown(e, block.id, 'nw')}></div>
                    <div class="rh rh-n"  onmousedown={(e) => onResizeMouseDown(e, block.id, 'n')}></div>
                    <div class="rh rh-ne" onmousedown={(e) => onResizeMouseDown(e, block.id, 'ne')}></div>
                  {/if}
                  <div class="rh rh-e"  onmousedown={(e) => onResizeMouseDown(e, block.id, 'e')}></div>
                  {#if !autoH}
                    <div class="rh rh-se" onmousedown={(e) => onResizeMouseDown(e, block.id, 'se')}></div>
                    <div class="rh rh-s"  onmousedown={(e) => onResizeMouseDown(e, block.id, 's')}></div>
                    <div class="rh rh-sw" onmousedown={(e) => onResizeMouseDown(e, block.id, 'sw')}></div>
                  {/if}
                  <div class="rh rh-w"  onmousedown={(e) => onResizeMouseDown(e, block.id, 'w')}></div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      </div>
    </div>

    <!-- RIGHT: Properties -->
    <div class="editor-panel props-panel">
      {#if selectedBlock}
        <div class="panel-header">{t('pdf_builder.eigenschaften')}</div>
        <div class="prop-section">
          <div class="prop-type-badge">{blockLabel(selectedBlock.type)}</div>
        </div>

        {#if selectedBlock.type !== 'line' && selectedBlock.type !== 'image'}
        <div class="prop-section">
          <label for="prop-fontsize">{t('pdf_builder.schriftgroesse')}</label>
          <input
            id="prop-fontsize"
            type="number"
            min="4"
            max="72"
            value={selectedBlock.fontSize ?? 10}
            onchange={(e) => updateBlock(selectedBlock!.id, { fontSize: Number((e.target as HTMLInputElement).value) })}
          />
        </div>

        <div class="prop-section">
          <label for="prop-fontcolor">{t('pdf_builder.schriftfarbe')}</label>
          <div class="color-input-wrap">
            <input
              id="prop-fontcolor"
              type="color"
              value={selectedBlock.fontColor ?? '#1c1b18'}
              onchange={(e) => updateBlock(selectedBlock!.id, { fontColor: (e.target as HTMLInputElement).value })}
            />
            <span class="color-hex">{selectedBlock.fontColor ?? '#1c1b18'}</span>
          </div>
        </div>

        <div class="prop-section">
          <span class="prop-label">{t('pdf_builder.schriftstaerke')}</span>
          <div class="toggle-group">
            <button
              class="toggle-btn"
              class:active={selectedBlock.fontWeight !== 'bold'}
              onclick={() => updateBlock(selectedBlock!.id, { fontWeight: 'normal' })}
            >{t('pdf_builder.normal')}</button>
            <button
              class="toggle-btn"
              class:active={selectedBlock.fontWeight === 'bold'}
              onclick={() => updateBlock(selectedBlock!.id, { fontWeight: 'bold' })}
            >{t('pdf_builder.fett')}</button>
          </div>
        </div>

        {#if template.customFonts && template.customFonts.length > 0}
        <div class="prop-section">
          <label for="prop-font-family">{t('pdf_builder.schriftart')}</label>
          <select
            id="prop-font-family"
            value={selectedBlock.fontFamily ?? ''}
            onchange={(e) => updateBlock(selectedBlock!.id, { fontFamily: (e.target as HTMLSelectElement).value || undefined })}
          >
            <option value="">{t('pdf_builder.helvetica_standard')}</option>
            {#each template.customFonts as cf}
              <option value={cf.name}>{cf.name}</option>
            {/each}
          </select>
        </div>
        {/if}

        {#if selectedBlock.type !== 'lines-table'}
        <div class="prop-section">
          <span class="prop-label">{t('pdf_builder.ausrichtung')}</span>
          <div class="toggle-group">
            <button
              class="toggle-btn"
              class:active={!selectedBlock.textAlign || selectedBlock.textAlign === 'left'}
              onclick={() => updateBlock(selectedBlock!.id, { textAlign: 'left' })}
              aria-label="Linksbündig"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="15" y2="12"/><line x1="3" y1="18" x2="18" y2="18"/>
              </svg>
            </button>
            <button
              class="toggle-btn"
              class:active={selectedBlock.textAlign === 'center'}
              onclick={() => updateBlock(selectedBlock!.id, { textAlign: 'center' })}
              aria-label="Zentriert"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="6" y1="12" x2="18" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
            <button
              class="toggle-btn"
              class:active={selectedBlock.textAlign === 'right'}
              onclick={() => updateBlock(selectedBlock!.id, { textAlign: 'right' })}
              aria-label="Rechtsbündig"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="9" y1="12" x2="21" y2="12"/><line x1="6" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
        {/if}
        {/if}

        {#if selectedBlock.type !== 'image' && selectedBlock.type !== 'line' && selectedBlock.type !== 'lines-table' && selectedBlock.type !== 'free-text'}
        <div class="prop-section">
          <label for="prop-content-override">{t('pdf_builder.inhalt_optional')}</label>
          <textarea
            id="prop-content-override"
            rows="2"
            placeholder={t('pdf_builder.leer_automatisch')}
            value={selectedBlock.content ?? ''}
            oninput={(e) => updateBlock(selectedBlock!.id, { content: (e.target as HTMLTextAreaElement).value || undefined })}
          ></textarea>
        </div>
        {/if}

        {#if selectedBlock.type === 'line'}
          <div class="prop-section">
            <span class="prop-label">{t('pdf_builder.richtung')}</span>
            <div class="toggle-group">
              <button
                class="toggle-btn"
                class:active={selectedBlock.lineDirection !== 'vertical'}
                onclick={() => updateBlock(selectedBlock!.id, { lineDirection: 'horizontal' })}
              >{t('pdf_builder.horizontal')}</button>
              <button
                class="toggle-btn"
                class:active={selectedBlock.lineDirection === 'vertical'}
                onclick={() => updateBlock(selectedBlock!.id, { lineDirection: 'vertical' })}
              >{t('pdf_builder.vertikal')}</button>
            </div>
          </div>

          <div class="prop-section">
            <label for="prop-linethickness">{t('pdf_builder.staerke')}</label>
            <div class="range-wrap">
              <input
                id="prop-linethickness"
                type="range"
                min="0.25"
                max="10"
                step="0.25"
                value={selectedBlock.lineThickness ?? 1}
                oninput={(e) => updateBlock(selectedBlock!.id, { lineThickness: Number((e.target as HTMLInputElement).value) })}
              />
              <span class="range-value">{(selectedBlock.lineThickness ?? 1).toFixed(2)}</span>
            </div>
          </div>

          <div class="prop-section">
            <label for="prop-linecolor">{t('pdf_builder.farbe')}</label>
            <div class="color-input-wrap">
              <input
                id="prop-linecolor"
                type="color"
                value={selectedBlock.lineColor ?? '#1c1b18'}
                onchange={(e) => updateBlock(selectedBlock!.id, { lineColor: (e.target as HTMLInputElement).value })}
              />
              <span class="color-hex">{selectedBlock.lineColor ?? '#1c1b18'}</span>
            </div>
          </div>
        {/if}

        <div class="prop-divider"></div>

        <div class="prop-section">
          <span class="prop-label">{t('pdf_builder.position')}</span>
          <div class="prop-pair">
            <div class="prop-pair-field">
              <span class="prop-pair-label">X</span>
              <input
                type="number"
                value={selectedBlock.x}
                onchange={(e) => updateBlock(selectedBlock!.id, { x: Number((e.target as HTMLInputElement).value) })}
              />
            </div>
            <div class="prop-pair-field">
              <span class="prop-pair-label">Y</span>
              <input
                type="number"
                value={selectedBlock.y}
                onchange={(e) => updateBlock(selectedBlock!.id, { y: Number((e.target as HTMLInputElement).value) })}
              />
            </div>
          </div>
        </div>

        <div class="prop-section">
          <span class="prop-label">{t('pdf_builder.groesse')}</span>
          <div class="prop-pair">
            <div class="prop-pair-field">
              <span class="prop-pair-label">B</span>
              <input
                type="number"
                value={selectedBlock.width}
                onchange={(e) => updateBlock(selectedBlock!.id, { width: Number((e.target as HTMLInputElement).value) })}
              />
            </div>
            {#if !isAutoHeight(selectedBlock.type)}
            <div class="prop-pair-field">
              <span class="prop-pair-label">H</span>
              <input
                type="number"
                value={selectedBlock.height}
                onchange={(e) => updateBlock(selectedBlock!.id, { height: Number((e.target as HTMLInputElement).value) })}
              />
            </div>
            {/if}
          </div>
        </div>


        {#if !['image', 'line', 'lines-table'].includes(selectedBlock.type)}
        <div class="prop-section">
          <span class="prop-label">{t('pdf_builder.innenabstand')}</span>
          <div class="prop-pair">
            <div class="prop-pair-field">
              <span class="prop-pair-label">Links</span>
              <input
                type="number" min="0" max="100" step="1"
                value={selectedBlock.paddingLeft ?? 0}
                onchange={(e) => { const v = Number((e.target as HTMLInputElement).value); updateBlock(selectedBlock!.id, { paddingLeft: v > 0 ? v : undefined }); }}
              />
            </div>
            <div class="prop-pair-field">
              <span class="prop-pair-label">Rechts</span>
              <input
                type="number" min="0" max="100" step="1"
                value={selectedBlock.paddingRight ?? 0}
                onchange={(e) => { const v = Number((e.target as HTMLInputElement).value); updateBlock(selectedBlock!.id, { paddingRight: v > 0 ? v : undefined }); }}
              />
            </div>
          </div>
        </div>
        {/if}

        {#if selectedBlock.type === 'image'}
          <div class="prop-section">
            <label>
              <input
                type="checkbox"
                checked={selectedBlock.lockAspectRatio !== false}
                onchange={(e) => updateBlock(selectedBlock!.id, { lockAspectRatio: (e.target as HTMLInputElement).checked })}
                class="prop-checkbox"
              />
              {t('pdf_builder.seitenverhaeltnis_sperren')}
            </label>
          </div>
        {/if}

        {#if selectedBlock.type === 'free-text'}
          <div class="prop-divider"></div>
          <div class="prop-section">
            <label for="prop-content">{t('pdf_builder.inhalt')}</label>
            <textarea
              id="prop-content"
              rows="3"
              value={selectedBlock.content ?? ''}
              oninput={(e) => updateBlock(selectedBlock!.id, { content: (e.target as HTMLTextAreaElement).value })}
            ></textarea>
          </div>
        {/if}

        {#if selectedBlock.type === 'lines-table'}
          <div class="prop-divider"></div>
          <div class="prop-section">
            <label>
              <input
                type="checkbox"
                checked={selectedBlock.showHeader !== false}
                onchange={(e) => updateBlock(selectedBlock!.id, { showHeader: (e.target as HTMLInputElement).checked })}
                class="prop-checkbox"
              />
              {t('pdf_builder.kopfzeile_anzeigen')}
            </label>
          </div>

          <div class="prop-section">
            <label for="prop-lineheight">{t('pdf_builder.zeilenhoehe')}</label>
            <div class="range-wrap">
              <input
                id="prop-lineheight"
                type="range"
                min="1.2"
                max="3.0"
                step="0.1"
                value={selectedBlock.lineHeight ?? 1.8}
                oninput={(e) => updateBlock(selectedBlock!.id, { lineHeight: Number((e.target as HTMLInputElement).value) })}
              />
              <span class="range-value">{(selectedBlock.lineHeight ?? 1.8).toFixed(1)}</span>
            </div>
          </div>

          <div class="prop-section">
            <span class="prop-label">{t('pdf_builder.spalten')}</span>
            {#each [
              { key: 'pos', label: t('pdf_builder.pos') },
              { key: 'name', label: t('pdf_builder.bezeichnung') },
              { key: 'qty', label: t('pdf_builder.menge') },
              { key: 'unit', label: t('pdf_builder.einheit_col') },
              { key: 'price', label: t('pdf_builder.einzelpreis') },
              { key: 'total', label: t('pdf_builder.netto') },
            ] as col}
              <div class="col-config-row" class:col-hidden={selectedBlock.columns && selectedBlock.columns.length > 0 && !selectedBlock.columns.includes(col.key)}>
                <label class="col-check">
                  <input
                    type="checkbox"
                    checked={!selectedBlock.columns || selectedBlock.columns.length === 0 || selectedBlock.columns.includes(col.key)}
                    onchange={(e) => {
                      const checked = (e.target as HTMLInputElement).checked;
                      const current = selectedBlock!.columns && selectedBlock!.columns.length > 0
                        ? [...selectedBlock!.columns]
                        : ['pos', 'name', 'qty', 'unit', 'price', 'total'];
                      const updated = checked
                        ? [...current, col.key].filter((v, i, a) => a.indexOf(v) === i)
                        : current.filter(c => c !== col.key);
                      updateBlock(selectedBlock!.id, { columns: updated.length === 6 ? [] : updated });
                    }}
                    class="prop-checkbox"
                  />
                  {col.label}
                </label>
                <div class="col-align-btns">
                  {#each (['left', 'center', 'right'] as const) as align}
                    <button
                      class="col-align-btn"
                      class:active={(selectedBlock.columnAlignments?.[col.key as keyof typeof selectedBlock.columnAlignments] ?? 'left') === align}
                      onclick={() => {
                        const cur = { ...(selectedBlock!.columnAlignments ?? {}) };
                        if (align === 'left') {
                          delete cur[col.key as keyof typeof cur];
                        } else {
                          (cur as any)[col.key] = align;
                        }
                        updateBlock(selectedBlock!.id, { columnAlignments: cur });
                      }}
                      title={align === 'left' ? t('pdf_builder.links') : align === 'center' ? t('pdf_builder.zentriert') : t('pdf_builder.rechts')}
                      aria-label={align === 'left' ? t('pdf_builder.links_ausrichten') : align === 'center' ? t('pdf_builder.zentrieren') : t('pdf_builder.rechts_ausrichten')}
                    >{align === 'left' ? 'L' : align === 'center' ? 'M' : 'R'}</button>
                  {/each}
                </div>
              </div>
            {/each}
          </div>

          <div class="prop-section">
            <span class="prop-label">{t('pdf_builder.tabellenstil')}</span>
            <div class="toggle-group">
              <button class="toggle-btn" class:active={!selectedBlock.tableStyle || selectedBlock.tableStyle === 'minimal'} onclick={() => updateBlock(selectedBlock!.id, { tableStyle: 'minimal' })}>{t('pdf_builder.minimal')}</button>
              <button class="toggle-btn" class:active={selectedBlock.tableStyle === 'grid'} onclick={() => updateBlock(selectedBlock!.id, { tableStyle: 'grid' })}>{t('pdf_builder.gitter')}</button>
              <button class="toggle-btn" class:active={selectedBlock.tableStyle === 'striped'} onclick={() => updateBlock(selectedBlock!.id, { tableStyle: 'striped' })}>{t('pdf_builder.gestreift')}</button>
            </div>
            <div class="toggle-group" style="margin-top: 4px;">
              <button class="toggle-btn" class:active={selectedBlock.tableStyle === 'compact'} onclick={() => updateBlock(selectedBlock!.id, { tableStyle: 'compact' })}>{t('pdf_builder.kompakt')}</button>
              <button class="toggle-btn" class:active={selectedBlock.tableStyle === 'elegant'} onclick={() => updateBlock(selectedBlock!.id, { tableStyle: 'elegant' })}>{t('pdf_builder.elegant')}</button>
              <button class="toggle-btn" class:active={selectedBlock.tableStyle === 'modern'} onclick={() => updateBlock(selectedBlock!.id, { tableStyle: 'modern' })}>{t('pdf_builder.modern')}</button>
            </div>
          </div>

          <div class="prop-section">
            <label for="prop-table-hdr-bg">{t('pdf_builder.kopfzeilen_hintergrund')}</label>
            <div class="color-input-wrap">
              <input
                id="prop-table-hdr-bg"
                type="color"
                value={selectedBlock.tableHeaderBgColor ?? '#f0f0eb'}
                onchange={(e) => updateBlock(selectedBlock!.id, { tableHeaderBgColor: (e.target as HTMLInputElement).value })}
              />
              <span class="color-hex">{selectedBlock.tableHeaderBgColor ?? '#f0f0eb'}</span>
            </div>
          </div>

          <div class="prop-section">
            <label for="prop-table-hdr-line">{t('pdf_builder.kopfzeilen_linie')}</label>
            <div class="color-input-wrap">
              <input
                id="prop-table-hdr-line"
                type="color"
                value={selectedBlock.tableHeaderLineColor ?? (
                  (selectedBlock.tableStyle ?? 'minimal') === 'compact' ? '#a62f24'
                  : (selectedBlock.tableStyle ?? 'minimal') === 'elegant' ? '#555555'
                  : (selectedBlock.tableStyle ?? 'minimal') === 'striped' ? '#bbb9b0'
                  : '#d1cfc7'
                )}
                onchange={(e) => updateBlock(selectedBlock!.id, { tableHeaderLineColor: (e.target as HTMLInputElement).value })}
              />
              <span class="color-hex">{selectedBlock.tableHeaderLineColor ?? t('pdf_builder.standard')}</span>
            </div>
          </div>
        {/if}

        <div class="prop-divider"></div>
        <button class="danger prop-delete" onclick={() => deleteBlock(selectedBlock!.id)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
          {t('pdf_builder.block_loeschen')}
        </button>
      {:else}
        <div class="panel-header">{t('pdf_builder.seite')}</div>
        <div class="prop-section">
          <label for="prop-page-size">{t('pdf_builder.seite_format')}</label>
          <select id="prop-page-size" bind:value={template.pageSize}>
            <option value="a4">A4</option>
            <option value="letter">Letter</option>
          </select>
        </div>
        <div class="prop-section">
          <label for="prop-page-orient">{t('pdf_builder.seite_ausrichtung')}</label>
          <select id="prop-page-orient" bind:value={template.orientation}>
            <option value="portrait">{t('pdf_builder.hochformat')}</option>
            <option value="landscape">{t('pdf_builder.querformat')}</option>
          </select>
        </div>
        <div class="props-empty" style="margin-top: 0.75rem;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke-dasharray="4 3"/>
            <path d="M12 8v8m-4-4h8" opacity="0.4"/>
          </svg>
          <span>{t('pdf_builder.block_auswaehlen')}</span>
        </div>
      {/if}

      <div class="prop-divider"></div>
      <div class="panel-header">{t('pdf_builder.vorschau_panel')}</div>
      <div class="preview-section">
        <label for="preview-invoice">{t('pdf_builder.rechnung_label')}</label>
        <select id="preview-invoice" bind:value={selectedInvoiceId}>
          {#each invoices as inv}
            <option value={inv.id}>{inv.invoiceNumber} — {inv.buyerName}</option>
          {/each}
        </select>
        {#if !selectedInvoiceId}
          <p class="preview-hint">{t('pdf_builder.erstelle_rechnung_zuerst')}</p>
        {/if}
      </div>
    </div>

    <!-- LIVE PDF PREVIEW PANEL -->
  </div>
{/if}

<!-- Preview Modal -->
{#if previewOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-backdrop" role="presentation" onclick={closePreview}>
    <div class="modal preview-modal" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <div class="modal-header">
        <h2>{t('pdf_builder.pdf_vorschau')}</h2>
        <button class="modal-close" onclick={closePreview} aria-label={t('pdf_builder.schliessen')}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="modal-body preview-body">
        {#if previewLoading}
          <div class="loading-card">
            <div class="loading-pulse"></div>
            <span>{t('pdf_builder.pdf_wird_generiert')}</span>
          </div>
        {:else if previewBlobUrl}
          <object data={previewBlobUrl} type="application/pdf" class="preview-pdf" aria-label={t('pdf_builder.pdf_vorschau')}>
            <p>{t('pdf_builder.pdf_nicht_unterstuetzt')} <a href={previewBlobUrl} target="_blank" rel="noopener">{t('pdf_builder.pdf_oeffnen')}</a></p>
          </object>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* ===== LIST MODE ===== */
  .page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1.5rem;
  }

  .page-title-group {
    display: flex;
    flex-direction: column;
  }

  h1 {
    font-family: var(--font-display);
    font-size: 1.65rem;
    font-weight: 700;
    letter-spacing: -0.025em;
    line-height: 1.2;
  }

  .subtitle {
    font-size: 0.8125rem;
    color: var(--text-muted);
    margin-top: 0.2rem;
  }

  .error-banner {
    background: #fef2f2;
    border: 1px solid #fecaca;
    color: var(--danger);
    padding: 0.65rem 1rem;
    border-radius: var(--radius);
    font-size: 0.8125rem;
    margin-bottom: 1rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .loading-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 3.5rem 2rem;
    text-align: center;
    color: var(--text-muted);
    font-size: 0.875rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .loading-pulse {
    width: 32px;
    height: 32px;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .empty-state {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-xl);
    padding: 4rem 2rem;
    text-align: center;
    animation: slideUp 0.4s var(--ease-out);
  }

  .empty-icon {
    color: var(--text-muted);
    opacity: 0.35;
    margin-bottom: 1rem;
  }

  .empty-state h2 {
    font-family: var(--font-display);
    font-size: 1.15rem;
    font-weight: 600;
    color: var(--text);
    margin-bottom: 0.4rem;
  }

  .empty-state p {
    color: var(--text-muted);
    font-size: 0.875rem;
    margin-bottom: 1.25rem;
  }

  .templates-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 0.85rem;
  }

  .template-card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 0;
    overflow: hidden;
    transition: all 0.2s var(--ease-out);
    animation: slideUp 0.3s var(--ease-out) both;
  }

  .template-card:hover {
    border-color: var(--border-strong);
    box-shadow: var(--shadow);
  }

  .card-preview-strip {
    background: var(--bg-warm);
    border-bottom: 1px solid var(--border);
    padding: 1rem;
    display: flex;
    justify-content: center;
  }

  .mini-page {
    width: 56px;
    height: 79px;
    background: white;
    border: 1px solid var(--border);
    border-radius: 2px;
    box-shadow: var(--shadow-sm);
    position: relative;
    overflow: hidden;
  }

  .mini-block {
    position: absolute;
    background: var(--primary-10);
    border: 1px solid rgba(166, 47, 36, 0.15);
    border-radius: 1px;
  }

  .template-name {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.9375rem;
    padding: 1rem 1.35rem 0;
    margin-bottom: 0.6rem;
    color: var(--text);
  }

  .template-details {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0 1.35rem;
    margin-bottom: 0.65rem;
  }

  .template-detail {
    display: flex;
    justify-content: space-between;
    font-size: 0.8rem;
    padding: 0.15rem 0;
  }

  .detail-key {
    color: var(--text-muted);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .detail-val {
    color: var(--text-secondary);
    font-weight: 500;
  }

  .template-pdf-row {
    display: flex;
    gap: 0.4rem;
    align-items: center;
    padding: 0.6rem 0.85rem;
    border-top: 1px solid var(--border);
    background: var(--surface-alt);
  }

  .template-pdf-select {
    flex: 1;
    width: auto;
    font-size: 0.8125rem;
    padding: 0.35rem 0.55rem;
  }

  .pdf-dl-btn {
    font-size: 0.8125rem;
    padding: 0.35rem 0.65rem;
    flex-shrink: 0;
  }

  .btn-spinner {
    display: inline-block;
    width: 10px;
    height: 10px;
    border: 1.5px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .template-actions {
    display: flex;
    gap: 0.35rem;
    padding: 0.65rem 1.35rem;
    border-top: 1px solid var(--border);
  }

  .template-actions button {
    padding: 0.3rem 0.65rem;
    font-size: 0.75rem;
  }

  /* ===== EDITOR MODE ===== */
  .editor-toolbar {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 0.4rem 0.5rem;
    margin-bottom: 0.75rem;
    animation: slideUp 0.3s var(--ease-out);
  }

  .toolbar-back {
    padding: 0.45rem;
    flex-shrink: 0;
  }

  .toolbar-field {
    flex: 1;
    min-width: 0;
  }

  .toolbar-name {
    border: 1px solid transparent;
    background: transparent;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 0.9375rem;
    padding: 0.4rem 0.65rem;
    border-radius: var(--radius);
    width: 100%;
  }

  .toolbar-name:hover {
    border-color: var(--border);
  }

  .toolbar-name:focus {
    border-color: var(--primary);
    background: var(--surface);
    box-shadow: 0 0 0 3px var(--primary-10);
    outline: none;
  }

  .toolbar-actions {
    display: flex;
    gap: 0.35rem;
    flex-shrink: 0;
    margin-left: auto;
  }

  .toolbar-zoom {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    flex-shrink: 0;
    align-self: stretch;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0 0.2rem;
  }

  .zoom-btn {
    padding: 0.25rem 0.45rem;
    font-size: 1rem;
    font-weight: 400;
    line-height: 1;
    border: none;
    background: none;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: var(--radius);
    align-self: stretch;
    display: flex;
    align-items: center;
  }

  .zoom-btn:hover { background: var(--primary-light); color: var(--primary); }

  .zoom-btn-preset {
    font-size: 0.65rem;
    font-weight: 700;
    padding: 0.25rem 0.35rem;
  }

  .zoom-divider {
    width: 1px;
    background: var(--border);
    align-self: stretch;
    margin: 0.2rem 0.1rem;
  }

  .zoom-display {
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-secondary);
    min-width: 34px;
    text-align: center;
    user-select: none;
  }

  .editor-layout {
    display: grid;
    grid-template-columns: 180px 1fr 220px;
    gap: 0.75rem;
    min-height: calc(100vh - 180px);
    animation: fadeIn 0.4s var(--ease-out);
  }

  /* --- Panels --- */
  .editor-panel {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 0.85rem;
    overflow-y: auto;
    max-height: calc(100vh - 180px);
  }

  .panel-header {
    font-family: var(--font-display);
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-muted);
    margin-bottom: 0.6rem;
    padding-bottom: 0.4rem;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .panel-header-toggle {
    cursor: pointer;
    user-select: none;
  }

  .panel-header-toggle:hover {
    color: var(--primary);
  }

  .panel-header::before {
    content: '';
    width: 3px;
    height: 10px;
    background: var(--primary);
    border-radius: 2px;
    flex-shrink: 0;
  }

  .panel-divider {
    height: 1px;
    background: var(--border);
    margin: 0.75rem 0;
  }

  /* --- Palette --- */
  .palette-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.45rem 0.55rem;
    border-radius: var(--radius);
    background: none;
    border: 1px solid transparent;
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s var(--ease-out);
    justify-content: flex-start;
  }

  .palette-btn:hover {
    background: var(--primary-light);
    border-color: rgba(166, 47, 36, 0.12);
    color: var(--primary);
  }

  .palette-btn:active {
    transform: scale(0.97);
  }

  .palette-btn svg {
    opacity: 0.55;
    flex-shrink: 0;
  }

  .palette-btn:hover svg {
    opacity: 0.85;
  }

  .palette-group-header {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.35rem 0.2rem;
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-muted);
    cursor: pointer;
    user-select: none;
    border-radius: var(--radius);
    transition: color 0.12s;
  }

  .palette-group-header:hover {
    color: var(--text-secondary);
  }

  .group-chevron {
    flex-shrink: 0;
    transition: transform 0.15s var(--ease-out);
  }

  .group-chevron.expanded {
    transform: rotate(90deg);
  }

  .palette-items {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding-left: 0.35rem;
    margin-bottom: 0.3rem;
  }

  /* --- Logo --- */
  .logo-preview {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .logo-preview img {
    display: block;
    width: 100%;
    height: auto;
    max-height: 80px;
    object-fit: contain;
    background: white;
    padding: 0.35rem;
  }

  .logo-actions {
    display: flex;
    border-top: 1px solid var(--border);
  }

  .logo-action-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.3rem;
    cursor: pointer;
    color: var(--text-muted);
    border-radius: 0;
    border: none;
    background: none;
    transition: background 0.1s, color 0.1s;
    font-size: inherit;
  }

  .logo-action-btn:hover {
    background: var(--bg);
    color: var(--text);
  }

  .logo-action-btn + .logo-action-btn {
    border-left: 1px solid var(--border);
  }

  .upload-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    padding: 0.85rem 0.55rem;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius);
    color: var(--text-muted);
    font-size: 0.7rem;
    cursor: pointer;
    transition: all 0.15s var(--ease-out);
    text-transform: none;
    font-weight: 500;
    letter-spacing: normal;
  }

  .upload-area:hover {
    border-color: var(--primary);
    color: var(--primary);
    background: var(--primary-light);
  }

  .upload-area-small {
    padding: 0.55rem 0.4rem;
    font-size: 0.675rem;
    flex-direction: row;
    gap: 0.3rem;
  }

  .font-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 0.4rem;
  }

  .font-list-item {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.3rem;
    border-radius: var(--radius-sm);
    background: var(--bg);
    border: 1px solid var(--border);
  }

  .font-apply-btn {
    opacity: 0;
    transition: opacity 0.15s;
  }

  .font-list-item:hover .font-apply-btn {
    opacity: 1;
  }

  .font-list-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .font-list-name {
    font-size: 0.7rem;
    font-weight: 500;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .font-list-weights {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .font-weight-tag {
    font-size: 0.6rem;
    font-weight: 600;
    padding: 0 3px;
    border-radius: 2px;
    background: var(--border);
    color: var(--text-muted);
    line-height: 1.6;
    letter-spacing: 0.02em;
  }

  .font-weight-tag-bold {
    background: var(--primary-light);
    color: var(--primary);
  }

  .font-weight-tag-add {
    background: transparent;
    border: 1px dashed var(--text-muted);
    color: var(--text-muted);
    cursor: pointer;
  }

  .font-replace-label {
    cursor: pointer;
    display: flex;
    align-items: center;
  }

  .font-replace-label:hover {
    opacity: 0.75;
  }

  .font-weight-tag-replaceable {
    cursor: pointer;
  }

  .font-bold-upload {
    cursor: pointer;
    display: flex;
    align-items: center;
  }

  .font-bold-upload:hover {
    opacity: 0.75;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip: rect(0,0,0,0);
    border: 0;
  }

  /* --- Canvas --- */
  .editor-canvas-wrap {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    overflow: auto;
    border-radius: var(--radius-lg);
    background: var(--bg-warm);
    border: 1px solid var(--border);
    padding: 1.5rem;
    max-height: calc(100vh - 180px);
    outline: none; /* suppress focus ring from tabindex */
  }

  .canvas-scroll {
    display: flex;
    align-items: flex-start;
    justify-content: center;
  }

  .canvas-outer {
    position: relative;
    flex-shrink: 0;
    box-shadow:
      0 1px 3px rgba(28,27,24,0.08),
      0 4px 16px rgba(28,27,24,0.06),
      0 0 0 1px rgba(28,27,24,0.04);
    border-radius: 2px;
    overflow: hidden;
  }

  .canvas-page {
    position: relative;
    background: white;
    background-image:
      linear-gradient(rgba(0,0,0,0.02) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0,0,0,0.02) 1px, transparent 1px);
    background-size: 20px 20px;
    font-family: Helvetica, Arial, sans-serif;
  }

  .canvas-block {
    position: absolute;
    border-radius: 2px;
    background: rgba(166, 47, 36, 0.04);
    cursor: move;
    user-select: none;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    padding: 0;
    overflow: hidden;
    box-shadow: inset 0 0 0 1px rgba(166, 47, 36, 0.18);
    transition: box-shadow 0.1s, background 0.1s;
  }

  .canvas-block:hover {
    box-shadow: inset 0 0 0 1px rgba(166, 47, 36, 0.35);
    background: rgba(166, 47, 36, 0.06);
  }

  .canvas-block.selected {
    box-shadow: inset 0 0 0 2px var(--primary), 0 0 0 3px var(--primary-10);
    background: rgba(166, 47, 36, 0.06);
    z-index: 10;
    overflow: visible;
  }

  .block-snap-target {
    box-shadow: inset 0 0 0 1px var(--accent) !important;
    background: rgba(242, 76, 61, 0.06) !important;
  }

  .block-preview-content {
    pointer-events: none;
    overflow: hidden;
    line-height: 1.4;
    width: 100%;
    height: 100%;
    padding: 0;
    box-sizing: border-box;
  }

  .block-preview-content > div {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .preview-muted {
    opacity: 0.45;
    font-style: italic;
  }

  .preview-kv-row {
    display: flex;
    justify-content: space-between;
    white-space: nowrap;
    overflow: hidden;
  }

  .preview-kv-left {
    display: flex;
    justify-content: flex-start;
    gap: 4px;
    white-space: nowrap;
    overflow: hidden;
  }

  .preview-table {
    overflow: hidden;
    width: 100%;
  }

  .preview-table-grid-outer {
    border: 0.5px solid #d1cfc7;
  }

  .preview-table-row {
    display: flex;
  }

  .preview-table-cell {
    padding: 0 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    display: flex;
    align-items: center;
  }

  .preview-table-cell-vborder {
    border-right: 0.5px solid #d1cfc7;
  }

  .preview-table-header {
    font-weight: 700;
    display: flex;
    align-items: center;
  }

  .preview-table-row-minimal {
    border-bottom: 0.3px solid #e8e6e0;
  }

  .preview-table-row-grid {
    border-bottom: 0.5px solid #d1cfc7;
  }

  /* striped: strong header bg, distinct alternating rows */
  .preview-table-header-striped {
    background: #d8d6d0 !important;
    font-weight: 700;
    border-bottom: 1px solid #bbb9b0 !important;
  }

  .preview-table-stripe {
    background: #eeecea;
  }

  /* compact: no header bg, accent underline, dense rows */
  .preview-table-header-compact {
    background: transparent !important;
    font-weight: 700;
    padding-bottom: 1px;
  }

  .preview-table-row-compact {
    border-bottom: 0.7px solid #ccc;
  }

  /* elegant: no separators, spacious */
  .preview-table-header-elegant {
    background: transparent !important;
  }

  .preview-table-row-elegant {
    /* no border — intentionally blank */
  }

  /* modern: strong colored header, accent row lines */
  .preview-table-row-modern {
    border-bottom: 0.3px solid var(--accent);
  }

  .block-logo-img {
    display: block;
    width: 100%;
    height: auto;
    pointer-events: none;
  }

  .preview-line {
    pointer-events: none;
    flex-shrink: 0;
  }

  /* --- 8-direction resize handles --- */
  .rh {
    position: absolute;
    width: 8px;
    height: 8px;
    background: white;
    border: 1.5px solid var(--primary);
    border-radius: 2px;
    z-index: 20;
  }

  .rh:hover { background: var(--primary-light); }

  .rh-nw { top: -4px; left: -4px; cursor: nw-resize; }
  .rh-n  { top: -4px; left: calc(50% - 4px); cursor: n-resize; }
  .rh-ne { top: -4px; right: -4px; cursor: ne-resize; }
  .rh-e  { top: calc(50% - 4px); right: -4px; cursor: e-resize; }
  .rh-se { bottom: -4px; right: -4px; cursor: se-resize; }
  .rh-s  { bottom: -4px; left: calc(50% - 4px); cursor: s-resize; }
  .rh-sw { bottom: -4px; left: -4px; cursor: sw-resize; }
  .rh-w  { top: calc(50% - 4px); left: -4px; cursor: w-resize; }

  /* --- DIN 5008 Overlays --- */
  .overlay {
    position: absolute;
    pointer-events: none;
    z-index: 1;
  }

  .overlay-margins {
    border: 1.5px dashed rgba(59, 130, 246, 0.3);
    background: rgba(59, 130, 246, 0.02);
  }

  .overlay-window {
    border: 1.5px dashed rgba(34, 197, 94, 0.4);
    background: rgba(34, 197, 94, 0.04);
  }

  .overlay-foldmark {
    left: 0;
    width: 100%;
    height: 0;
    border-top: 1.5px dashed rgba(249, 115, 22, 0.4);
  }

  .overlay-foldmark::before {
    content: '';
    position: absolute;
    left: 0;
    top: -4px;
    width: 12px;
    height: 8px;
    border-right: 1.5px solid rgba(249, 115, 22, 0.5);
  }

  .overlay-punchmark::before {
    left: 0;
    top: -3px;
    width: 8px;
    height: 6px;
  }

  .overlay-label {
    position: absolute;
    font-size: 6px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 1px 3px;
    border-radius: 2px;
    white-space: nowrap;
  }

  .overlay-label-green {
    bottom: -1px;
    right: 2px;
    color: rgba(34, 197, 94, 0.7);
    background: rgba(34, 197, 94, 0.08);
  }

  .overlay-label-orange {
    top: 2px;
    left: 14px;
    color: rgba(249, 115, 22, 0.7);
    background: rgba(249, 115, 22, 0.08);
  }

  /* --- Guide Lines on Canvas --- */
  .canvas-guide {
    position: absolute;
    z-index: 5;
    cursor: move;
  }

  .canvas-guide:not(.locked) {
    border-top: 1.5px dashed rgba(168, 85, 247, 0.5);
    border-left: 1.5px dashed rgba(168, 85, 247, 0.5);
  }

  .canvas-guide.locked {
    border-top: 1.5px dashed rgba(168, 85, 247, 0.25);
    border-left: 1.5px dashed rgba(168, 85, 247, 0.25);
    pointer-events: none;
  }

  .canvas-guide.snapping {
    border-top: 2px solid rgba(168, 85, 247, 0.8);
    border-left: 2px solid rgba(168, 85, 247, 0.8);
  }

  .canvas-guide.active:not(.snapping) {
    border-top: 1.5px solid rgba(168, 85, 247, 0.7);
    border-left: 1.5px solid rgba(168, 85, 247, 0.7);
  }

  .guide-edit-input {
    position: absolute;
    width: 56px;
    padding: 1px 3px;
    font-size: 8px;
    border: 1px solid rgba(168, 85, 247, 0.5);
    border-radius: 2px;
    background: white;
    z-index: 6;
  }

  /* --- Guide Lines in Palette --- */
  .guide-visibility-btn {
    margin-left: auto;
    display: flex;
    align-items: center;
    cursor: pointer;
    color: var(--text-muted);
    padding: 1px 2px;
    border-radius: 2px;
    opacity: 0.7;
    transition: opacity 0.1s, color 0.1s;
  }

  .guide-visibility-btn:hover {
    opacity: 1;
    color: var(--text);
  }

  .guide-add-btns {
    display: flex;
    gap: 0.25rem;
  }

  .guide-add-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    padding: 0.3rem 0.3rem;
    font-size: 0.65rem;
  }

  .guide-list {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    margin-top: 0.35rem;
  }

  .guide-list-item {
    display: flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.2rem 0.3rem;
    border-radius: var(--radius);
    font-size: 0.68rem;
    transition: background 0.1s;
  }

  .guide-list-item.active {
    background: rgba(168, 85, 247, 0.08);
  }

  .guide-list-label {
    flex: 1;
    font-weight: 500;
    color: var(--text-secondary);
    font-family: monospace;
    font-size: 0.65rem;
  }

  .guide-list-btn {
    padding: 0.15rem;
    color: var(--text-muted);
    flex-shrink: 0;
  }

  .guide-list-btn:hover {
    color: var(--text);
  }

  /* --- Overlay Toggles in Palette --- */
  .overlay-toggles {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .overlay-toggle {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.72rem;
    font-weight: 400;
    color: var(--text-secondary);
    text-transform: none;
    letter-spacing: normal;
    cursor: pointer;
    padding: 0.1rem 0.2rem;
    border-radius: 3px;
    transition: background 0.12s;
  }

  .overlay-toggle:hover {
    background: rgba(255,255,255,0.04);
  }

  .overlay-hidden {
    opacity: 0.45;
  }

  .overlay-eye {
    flex-shrink: 0;
    color: var(--sidebar-text);
    display: flex;
    align-items: center;
  }

  .overlay-swatch {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border-width: 0;
  }

  .margin-inputs {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    margin-top: 0.4rem;
    padding-left: 0.15rem;
  }

  .margin-row label {
    display: grid;
    grid-template-columns: 42px 48px auto;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.68rem;
    font-weight: 400;
    color: var(--text-secondary);
    text-transform: none;
    letter-spacing: normal;
  }

  .margin-label {
    font-weight: 500;
  }

  .margin-unit {
    font-size: 0.68rem;
    color: var(--text-muted);
  }

  .margin-input {
    width: 48px;
    padding: 0.2rem 0.3rem;
    font-size: 0.68rem;
    text-align: right;
  }

  /* --- Properties Panel --- */
  .props-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1.5rem 0.5rem;
    color: var(--text-muted);
    font-size: 0.75rem;
    text-align: center;
    opacity: 0.6;
  }

  .prop-section {
    margin-bottom: 0.55rem;
  }

  .prop-section label,
  .prop-label {
    display: block;
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 0.2rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .prop-section input[type="number"],
  .prop-section textarea {
    padding: 0.35rem 0.5rem;
    font-size: 0.75rem;
  }

  .prop-type-badge {
    display: inline-flex;
    padding: 0.2rem 0.55rem;
    background: var(--primary-light);
    color: var(--primary);
    font-size: 0.65rem;
    font-weight: 700;
    border-radius: 6px;
    letter-spacing: 0.02em;
  }

  .color-input-wrap {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .color-input-wrap input[type="color"] {
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    cursor: pointer;
    flex-shrink: 0;
  }

  .color-hex {
    font-size: 0.7rem;
    font-family: monospace;
    color: var(--text-muted);
  }

  .toggle-group {
    display: flex;
    gap: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
  }

  .toggle-btn {
    flex: 1;
    padding: 0.3rem 0.4rem;
    font-size: 0.7rem;
    font-weight: 500;
    border: none;
    border-radius: 0;
    background: var(--surface);
    color: var(--text-muted);
    cursor: pointer;
    transition: all 0.12s;
  }

  .toggle-btn + .toggle-btn {
    border-left: 1px solid var(--border);
  }

  .toggle-btn.active {
    background: var(--primary-light);
    color: var(--primary);
    font-weight: 600;
  }

  .prop-pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.3rem;
  }

  .prop-pair-field {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
  }

  .prop-pair-field input {
    flex: 1;
    min-width: 0; /* allow input to shrink below its intrinsic width */
    width: auto;
  }

  .prop-pair-label {
    font-size: 0.6rem;
    font-weight: 700;
    color: var(--text-muted);
    flex-shrink: 0;
    white-space: nowrap;
  }

  .prop-divider {
    height: 1px;
    background: var(--border);
    margin: 0.6rem 0;
  }

  .prop-delete {
    width: 100%;
    font-size: 0.72rem;
  }

  .prop-checkbox {
    width: auto;
    margin-right: 0.35rem;
    vertical-align: middle;
  }

  .range-wrap {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .range-wrap input[type="range"] {
    flex: 1;
    height: 4px;
    accent-color: var(--primary);
    cursor: pointer;
  }

  .range-value {
    font-size: 0.7rem;
    font-family: monospace;
    color: var(--text-muted);
    min-width: 24px;
    text-align: right;
  }

  .col-config-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.15rem;
  }

  .col-config-row.col-hidden {
    opacity: 0.38;
  }

  .col-check {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.72rem;
    font-weight: 400;
    color: var(--text-secondary);
    text-transform: none;
    letter-spacing: normal;
    cursor: pointer;
    flex: 1;
  }

  .col-align-btns {
    display: flex;
    gap: 1px;
  }

  .col-align-btn {
    padding: 1px 5px;
    font-size: 0.6rem;
    font-weight: 600;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 2px;
    line-height: 1.6;
  }

  .col-align-btn:first-child { border-radius: 2px 0 0 2px; }
  .col-align-btn:last-child { border-radius: 0 2px 2px 0; }
  .col-align-btn:not(:first-child):not(:last-child) { border-radius: 0; border-left: none; }

  .col-align-btn.active {
    background: var(--primary);
    color: #fff;
    border-color: var(--primary);
  }

  .preview-section {
    margin-top: 0.35rem;
  }

  .preview-section select {
    font-size: 0.75rem;
    padding: 0.35rem 2rem 0.35rem 0.5rem;
    margin-top: 0.2rem;
    text-overflow: ellipsis;
  }

  .preview-hint {
    font-size: 0.7rem;
    color: var(--text-muted);
    margin-top: 0.4rem;
    line-height: 1.4;
  }

  /* ===== PREVIEW MODAL ===== */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(28,27,24,0.45);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 200;
    padding: 1rem;
    animation: fadeIn 0.15s var(--ease-out);
  }

  .modal {
    background: var(--surface);
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-lg);
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    animation: scaleIn 0.2s var(--ease-out);
  }

  .preview-modal {
    max-width: 860px;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.15rem 1.35rem 0.85rem;
    border-bottom: 1px solid var(--border);
  }

  .modal-header h2 {
    font-family: var(--font-display);
    font-size: 1.15rem;
    font-weight: 600;
  }

  .modal-close {
    background: none;
    border: none;
    padding: 0.3rem;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: var(--radius);
    transition: all 0.12s;
  }

  .modal-close:hover {
    background: var(--surface-alt);
    color: var(--text);
  }

  .modal-body {
    padding: 1.35rem;
  }

  .preview-body {
    padding: 0;
    min-height: 500px;
  }

  .preview-pdf {
    width: 100%;
    height: 75vh;
    border: none;
    border-radius: 0 0 var(--radius-xl) var(--radius-xl);
  }
</style>
