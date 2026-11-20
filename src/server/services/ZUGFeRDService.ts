/**
 * ZUGFeRDService — embeds an XRechnung CII XML file into a PDF to produce a
 * hybrid ZUGFeRD 2.3 / Factur-X XRECHNUNG invoice.
 *
 * The resulting PDF contains:
 *  • xrechnung.xml (CII syntax) as an EmbeddedFile with AFRelationship = Alternative
 *  • /AF array in the document catalog pointing at the embedded file
 *  • XMP metadata stream with PDF/A-3b and ZUGFeRD XRECHNUNG declarations
 *
 * Note: strict PDF/A-3 conformance additionally requires colour-space
 * declarations, font embedding, etc. that the base renderer does not
 * produce. The XMP declaration, embedded file and AF entry are the
 * requirements checked by most ZUGFeRD validators (Mustang, Factur-X lib).
 *
 * Spec reference:
 *  ZUGFeRD 2.3 / Factur-X 1.0.07
 *  Namespace: urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#
 */

import { PDF, PdfArray, PdfDict, PdfName, PdfStream } from '@libpdf/core';

/** AFRelationship value required by ZUGFeRD for the invoice attachment. */
const AF_RELATIONSHIP = 'Alternative';

/** Embedded file name mandated by the ZUGFeRD XRECHNUNG profile. */
const ATTACHMENT_NAME = 'xrechnung.xml';

export class ZUGFeRDService {
  /**
   * Embed `xmlString` into `pdfBytes` and return ZUGFeRD-compliant PDF bytes.
   *
   * @param pdfBytes  Raw PDF produced by PdfRenderService.render()
   * @param xmlString XRechnung CII XML string (from CIIInvoiceXmlService.generate())
   */
  async embed(pdfBytes: Uint8Array, xmlString: string): Promise<Uint8Array> {
    const pdf = await PDF.load(pdfBytes);
    const xmlBytes = new TextEncoder().encode(xmlString);

    // 1. Attach the XML file
    pdf.addAttachment(ATTACHMENT_NAME, xmlBytes, {
      mimeType: 'text/xml',
      description: 'XRechnung CII Invoice',
    });

    // 2. Set AFRelationship on the FileSpec dict and add /AF to catalog
    //
    // NOTE: NameTree.get() resolves indirect references — it returns the
    // resolved PdfDict, not the PdfRef. Use ctx.getRef() to retrieve the
    // original indirect reference for inclusion in the /AF array.
    const ctx = pdf.context;
    const tree = ctx.catalog.getEmbeddedFilesTree();
    if (tree) {
      const fileSpec = tree.get(ATTACHMENT_NAME);
      if (fileSpec instanceof PdfDict) {
        fileSpec.set('AFRelationship', PdfName.of(AF_RELATIONSHIP));
        const fileSpecRef = ctx.getRef(fileSpec);
        if (fileSpecRef) {
          // Add /AF array to document catalog (points at the file spec)
          const catalog = pdf.getCatalog();
          catalog.set('AF', PdfArray.of(fileSpecRef));
        }
      }
    }

    // 3. Create and set ZUGFeRD XMP metadata stream
    const xmpBytes = new TextEncoder().encode(this.buildXmp());
    const metadataStream = PdfStream.fromDict(
      { Type: PdfName.of('Metadata'), Subtype: PdfName.of('XML') },
      xmpBytes,
    );
    const metadataRef = ctx.register(metadataStream);
    pdf.getCatalog().set('Metadata', metadataRef);

    return new Uint8Array(await pdf.save());
  }

  private buildXmp(): string {
    // The BOM character (\uFEFF) before the encoding declaration is required by the XMP spec.
    return (
      `<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>\n` +
      `<x:xmpmeta xmlns:x="adobe:ns:meta/">\n` +
      `  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n` +

      // PDF/A-3b conformance declaration
      `    <rdf:Description rdf:about=""\n` +
      `        xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">\n` +
      `      <pdfaid:part>3</pdfaid:part>\n` +
      `      <pdfaid:conformance>B</pdfaid:conformance>\n` +
      `    </rdf:Description>\n` +

      // ZUGFeRD / Factur-X metadata
      `    <rdf:Description rdf:about=""\n` +
      `        xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">\n` +
      `      <fx:DocumentFileName>${ATTACHMENT_NAME}</fx:DocumentFileName>\n` +
      `      <fx:DocumentType>INVOICE</fx:DocumentType>\n` +
      `      <fx:Version>3.0</fx:Version>\n` +
      `      <fx:ConformanceLevel>XRECHNUNG</fx:ConformanceLevel>\n` +
      `    </rdf:Description>\n` +

      // PDF/A extension schema declaration (required for strict conformance validators)
      `    <rdf:Description rdf:about=""\n` +
      `        xmlns:pdfaExtension="http://www.aiim.org/pdfa/ns/extension/"\n` +
      `        xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"\n` +
      `        xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">\n` +
      `      <pdfaExtension:schemas>\n` +
      `        <rdf:Bag>\n` +
      `          <rdf:li rdf:parseType="Resource">\n` +
      `            <pdfaSchema:schema>ZUGFeRD / Factur-X PDFA Extension Schema</pdfaSchema:schema>\n` +
      `            <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>\n` +
      `            <pdfaSchema:prefix>fx</pdfaSchema:prefix>\n` +
      `            <pdfaSchema:property>\n` +
      `              <rdf:Seq>\n` +
      `                <rdf:li rdf:parseType="Resource">\n` +
      `                  <pdfaProperty:name>DocumentFileName</pdfaProperty:name>\n` +
      `                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>\n` +
      `                  <pdfaProperty:category>external</pdfaProperty:category>\n` +
      `                  <pdfaProperty:description>Name of the embedded invoice XML file</pdfaProperty:description>\n` +
      `                </rdf:li>\n` +
      `                <rdf:li rdf:parseType="Resource">\n` +
      `                  <pdfaProperty:name>DocumentType</pdfaProperty:name>\n` +
      `                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>\n` +
      `                  <pdfaProperty:category>external</pdfaProperty:category>\n` +
      `                  <pdfaProperty:description>Type of the embedded invoice document</pdfaProperty:description>\n` +
      `                </rdf:li>\n` +
      `                <rdf:li rdf:parseType="Resource">\n` +
      `                  <pdfaProperty:name>Version</pdfaProperty:name>\n` +
      `                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>\n` +
      `                  <pdfaProperty:category>external</pdfaProperty:category>\n` +
      `                  <pdfaProperty:description>ZUGFeRD specification version (2.3 = Factur-X 1.0.07)</pdfaProperty:description>\n` +
      `                </rdf:li>\n` +
      `                <rdf:li rdf:parseType="Resource">\n` +
      `                  <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>\n` +
      `                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>\n` +
      `                  <pdfaProperty:category>external</pdfaProperty:category>\n` +
      `                  <pdfaProperty:description>ZUGFeRD conformance level / profile</pdfaProperty:description>\n` +
      `                </rdf:li>\n` +
      `              </rdf:Seq>\n` +
      `            </pdfaSchema:property>\n` +
      `          </rdf:li>\n` +
      `        </rdf:Bag>\n` +
      `      </pdfaExtension:schemas>\n` +
      `    </rdf:Description>\n` +

      `  </rdf:RDF>\n` +
      `</x:xmpmeta>\n` +
      `<?xpacket end="w"?>`
    );
  }
}
