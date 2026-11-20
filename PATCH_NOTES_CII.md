# CII export for ZUGFeRD XRECHNUNG profile

This patch separates the XML formats used by the standalone XRechnung export and the embedded XML in ZUGFeRD PDF invoices.

## Changes

- Standalone XRechnung XML export continues to use `XRechnungXmlService` (UBL 2.1).
- ZUGFeRD PDF export uses the new `CIIInvoiceXmlService` (UN/CEFACT Cross Industry Invoice, CII).
- Email attachments containing a ZUGFeRD PDF use the CII generator for the embedded XML.
- A separate `.xml` email attachment continues to use the standalone UBL XRechnung export.
- The embedded XML uses the `text/xml` MIME type.
- The PDF XMP metadata declares XRechnung profile version `3.0`.
- ZUGFeRD service tests have been updated to check the CII XML structure and metadata.

## Validation

The modified application was built and tested locally.

Generated invoices were successfully validated using:

- KoSIT Validator
- Mustangproject

Both validators reported valid results for the tested invoices.

## Build configuration

The Docker build configuration includes `pnpm-workspace.yaml` to configure build-script permissions required by the current pnpm version.
