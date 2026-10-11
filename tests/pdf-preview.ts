// Synthetic, non-client test tender used for visual review of PDF exports.
import { mkdir, writeFile } from 'node:fs/promises';
import { blankDocument } from '../shared/templates';
import { pdfBlob } from '../src/lib/exporters';

const document = blankDocument('tender-response');
document.title = 'Riverview College - Stage 3 Upgrades, Education Facilities and Specialist Services Tender Submission';
document.reference = 'TEST-EDU-2026-001';
document.date = '2026-10-11';
document.preparedBy = 'Alex Example';
document.business = {
  name: 'Example Facilities', legalName: 'Example Facilities Pty Ltd', abn: '00 000 000 000',
  email: 'contact@example.invalid', phone: '(08) 0000 0000',
  address: 'Perth Western Australia', website: 'example.invalid',
  colour: '#B7D3F4', secondaryColour: '#FFFFFF', accentColour: '#BEDBFF',
  textColour: '#172322', coverStyle: 'standard'
};
document.client = { name: 'Sample Construction Group', contact: 'Tender Team', email: '', address: '' };
const lead = 'We will coordinate the works through controlled area release, trained personnel, supervision, progressive inspections and a documented handover. This approach reduces disruption while maintaining a clear allocation of commercial and safety responsibilities.';
const dense = Array(12).fill(lead).join('\n\n');
const labourTable = [
  'Labour category | Hours | Composite rate (ex GST) | Current-dollar total (ex GST)',
  'General cleaning | 636 | $66.56 | $42,332.16',
  'Supervisor | 138 | $69.65 | $9,611.70',
  'Specialist glazing | 228 | $76.12 | $17,355.36',
  'External crew | 160 | $72.03 | $11,524.80'
].join('\n');
const ratesTable = [
  'Labour category | Normal hours | After hours | Saturday | Sunday | Public holiday',
  'General Cleaner | $67.00/hr | $84.00/hr | $101.00/hr | $134.00/hr | $168.00/hr',
  'Supervisor | $70.00/hr | $88.00/hr | $105.00/hr | $140.00/hr | $175.00/hr',
  'Specialist Glass Cleaner | $77.00/hr | $97.00/hr | $116.00/hr | $154.00/hr | $193.00/hr',
  'External Cleaning Crew | $73.00/hr | $92.00/hr | $110.00/hr | $146.00/hr | $183.00/hr'
].join('\n');
const sections: Array<[string,string]> = [
  ['Tender letter', 'Dear Tender Team,\n\nRE: NEW SCHOOL FACILITIES\n\n' + lead + '\n\nYours faithfully,\n\nAlex Example\n\nDirector'],
  ['Executive summary', lead + '\n\nCommercial item | Offer\nBase quotation | $85,224.02 excluding GST\nGST | $8,522.40\nTotal including GST | $93,746.42\nPersonnel | 15 peak staff\n\n' + lead],
  ['Company information', lead + '\n\nCompany detail | Information\nLegal entity | Example Facilities Pty Ltd\nABN | 00 000 000 000\nContact | Alex Example\nService area | Perth metropolitan area'],
  ['Project understanding', lead + '\n\nProject element | Understanding\nScience laboratories | Careful surface treatment and access coordination.\nOperational school | Screening and safe access controls.\nSpecialist glazing | Separate access planning for high-level areas.\n\n' + lead],
  ['Tender documents reviewed', 'Document group | Documents reviewed | Relevance\nContract conditions | General and special conditions | Scope and delivery obligations.\nProgramme | Indicative construction programme | Mobilisation planning.\nDrawings | Architectural drawings | Layout, finishes and access.'],
  ['Scope of works', 'Mobilisation and Site Establishment\n\n' + dense + '\n\nInternal areas\n\nArea type | Included cleaning\nLaboratories | Finish-sensitive benchtops, sinks and joinery.\nTeaching areas | Floors, doors, hardware and ledges.\nAmenities | Sanitary fittings and touch points.\n\n' + dense],
  ['Labour and resource plan', lead + '\n\n' + labourTable + '\n\n' + lead],
  ['Cleaning programme', 'Indicative programme\n\nPhase | Duration | Activity\nPre-start | Day 1 | Confirm safe access and zone release.\nMain clean | Days 1-11 | Progressively clean completed rooms.\nQuality review | Days 11-14 | Inspect and rectify items.\nFinal handover | Day 15 | Joint sign-off and records.\n\n' + lead],
  ['Cleaning methodology', 'Mobilisation methodology\n\n' + dense + '\n\nArea release method\n\nStep | Activity | Controls\n1 | Inspection | Verify site readiness.\n2 | Mobilisation | Protect sensitive finishes.\n3 | Cleaning | Work from high to low.\n4 | Sign-off | Inspect each room and record any issues.\n\n' + dense],
  ['Quality assurance', lead + '\n\nQuality gate | Responsibility | Record\nReadiness | Supervisor | Area release register\nSelf-check | Cleaner | Room checklist\nFinal review | Client | Signed handover\n\n' + lead],
  ['Work health and safety', 'Site safety management\n\n' + dense],
  ['Environmental management', lead + '\n\nControl | Method\nProduct selection | Use low-impact products compatible with finishes.\nWaste prevention | Use reusable cloths and durable tools.\nWater use | Avoid unnecessary rinsing.'],
  ['Pricing schedule', 'Base quotation\n\nPricing item | Amount\nSection 1 works | $5,967.16\nSection 2 works | $1,570.38\nMain works | $73,286.48\nEscalation allowance | $4,400.00\nTOTAL INCLUDING GST | $93,746.42'],
  ['Optional and provisional services', 'Optional service | Basis | Rate | Commercial note\nGlazing access | Provisional lump sum | $12,305.00 | Confirm after site survey.\nAdditional clean | Per visit | $8,740.00 | Subject to written instruction.\nCarpet extraction | Per m² | $4.25 | Finish approval required.'],
  ['Schedule of rates', ratesTable + '\n\nEquipment and consumables\n\nEquipment | Unit | Rate ex GST | Note\nVacuum | Daily | $65.00 | Additional unit.\nScissor lift | Daily | $850.00 | Subject to availability.'],
  ['Assumptions', 'Access Assumptions\n\n' + dense],
  ['Exclusions', 'Specialist access\n\n' + dense],
  ['Tender declaration', lead + '\n\nDeclaration field | Details\nLegal entity | Example Facilities Pty Ltd\nReference | TEST-EDU-2026-001\nAuthorised representative | Alex Example\nSignature |']
];
document.sections = sections.map(([title,body],i) => ({
  id: '00000000-0000-4000-8000-' + String(i + 201).padStart(12,'0'), title, body, required: true
}));
document.lines = [
  ['Area 1', '5967.16', false], ['Area 2', '1570.38', false],
  ['Main building', '73286.48', false], ['Escalation', '4400.00', false],
  ['Optional glazing access', '12305.00', true]
].map(([description,rate,optional],i) => ({
  id: '00000000-0000-4000-8000-' + String(i + 301).padStart(12,'0'),
  description: String(description), rate: String(rate), optional: Boolean(optional),
  unit: 'lump sum', quantity: '1', discountBps: 0, taxBps: 1000
}));
document.terms = 'This synthetic quotation is provided only as a layout test. It is not a commercial offer.';
const output = await pdfBlob(document);
await mkdir('artifacts', {recursive:true});
await writeFile('artifacts/pdf-layout-preview.pdf',new Uint8Array(await output.arrayBuffer()));
console.log('Rendered synthetic preview: ' + output.size + ' bytes');
