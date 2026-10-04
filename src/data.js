// The public pages the plan and the checks rest on, and what each says, written in this project's own words.
// research/sources.md lists every page with a longer note on each, and test/data.test.js checks that every page here is
// listed there and that every rule names points that exist. The code in src/ uses these constants and never writes a
// reason of its own in a report.

const CAF = 'https://learn.microsoft.com/en-us/azure/cloud-adoption-framework/migrate';

export const SOURCES = [
  { id: 'aws7rs', title: 'About the migration strategies (AWS Prescriptive Guidance, Guide for AWS large migrations)', url: 'https://docs.aws.amazon.com/prescriptive-guidance/latest/large-migration-guide/migration-strategies.html' },
  { id: 'cafPlan', title: 'Plan your migration (Microsoft Cloud Adoption Framework, Migrate)', url: `${CAF}/plan-migration` },
  { id: 'cafWaves', title: 'Migration wave planning (Microsoft Cloud Adoption Framework, Migrate)', url: `${CAF}/migration-wave-planning` },
  { id: 'cafExecute', title: 'Execute migration to cloud (Microsoft Cloud Adoption Framework, Migrate)', url: `${CAF}/execute-migration` },
  { id: 'rfc4180', title: 'RFC 4180, Common Format and MIME Type for Comma-Separated Values (CSV) Files', url: 'https://www.rfc-editor.org/rfc/rfc4180' },
  { id: 'rfc8259', title: 'RFC 8259, The JSON Data Interchange Format', url: 'https://www.rfc-editor.org/rfc/rfc8259' },
  { id: 'owaspCsv', title: 'CSV Injection (OWASP)', url: 'https://community.owasp.org/attacks/CSV_Injection' },
  { id: 'githubCommands', title: 'Workflow commands for GitHub Actions (GitHub Docs)', url: 'https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands' }
];

export const source = (id) => SOURCES.find((s) => s.id === id);

// What a page says, in this project's own words. Each point names its page.
export const POINTS = {
  sevenRs: { source: 'aws7rs', text: 'the guide names seven migration strategies, the 7 Rs: retire, retain, rehost, relocate, repurchase, replatform, and refactor or re-architect' },
  retire: { source: 'aws7rs', text: 'retire is the strategy for an application that is decommissioned or archived, so the servers of its stack can be shut down' },
  retain: { source: 'aws7rs', text: 'retain keeps an application in the source environment, for example because it is not ready to move or because other applications must move first' },
  rehost: { source: 'aws7rs', text: 'rehost, also called lift and shift, moves an application to the cloud without changing it' },
  relocate: { source: 'aws7rs', text: 'relocate moves many servers at once to a cloud version of the same platform, or moves resources to another network, Region or account, without changing the architecture' },
  repurchase: { source: 'aws7rs', text: 'repurchase, also called drop and shop, replaces an application with another version or product, often one sold as a service' },
  replatform: { source: 'aws7rs', text: 'replatform, also called lift, tinker and shift or lift and reshape, moves an application and makes some changes on the way, such as a managed database' },
  refactor: { source: 'aws7rs', text: 'refactor or re-architect changes the architecture of an application to use cloud-native features; it is the most complex strategy, and the guide advises against it for large migrations' },
  cafSequence: { source: 'cafPlan', text: 'the migration sequence decides which workloads move first so that dependent components move together, and a large portfolio is organized into migration waves' },
  cafSplit: { source: 'cafPlan', text: 'components that must stay in the source environment need their connections and data flows written down, and the time a workload runs across both environments should be kept short' },
  cafOwner: { source: 'cafPlan', text: 'the plan records for each workload its name, owner, criticality, migration method and downtime window, and the details of a workload include its owner and its dependencies' },
  cafWaves: { source: 'cafWaves', text: 'wave planning divides a large migration into smaller groups of workloads that are migrated together, in controlled batches' },
  cafGroup: { source: 'cafWaves', text: 'workloads that communicate or share resources go into the same wave, because a broken dependency disrupts the service; when it is not clear how critical a dependency is, the components are grouped together' },
  cafDocument: { source: 'cafWaves', text: 'each dependency group is written down with a unique identifier and name, its components, its critical dependencies and its constraints' },
  cafFallback: { source: 'cafExecute', text: 'the source environment is kept as a fallback after the cutover, so that DNS records and configurations can be reverted when a problem cannot be solved in time' },
  csvRecords: { source: 'rfc4180', text: 'each record of a CSV file is on its own line, ended by CRLF, the first line may be a header, and a field that holds a comma, a double quote or a line break is put in double quotes, with a double quote inside it written twice' },
  csvSameFields: { source: 'rfc4180', text: 'every line of a CSV file should hold the same number of fields' },
  csvInjection: { source: 'owaspCsv', text: 'a spreadsheet may read a cell that starts with =, +, -, @, a tab or a line break as a formula, and no one escape is safe in every program that opens the file' },
  jsonUtf8: { source: 'rfc8259', text: 'JSON text exchanged between systems must be UTF-8, and a reader may ignore a byte order mark at the start' },
  jsonRepeatedNames: { source: 'rfc8259', text: 'when an object repeats a name the behavior of the software that reads it cannot be predicted, so the reader of this tool refuses a repeated name' },
  githubAnnotations: { source: 'githubCommands', text: 'a line of output such as ::warning file=...,line=...::message becomes an annotation on that file and line in the run' }
};

// The page of a point.
export const pointPage = (key) => source(POINTS[key].source);

// The seven migration paths, in the order of the AWS guide, with the point that describes each. A workload whose path
// is retire or retain does not move and is kept out of the waves.
export const PATHS = [
  { name: 'retire', moves: false, point: 'retire' },
  { name: 'retain', moves: false, point: 'retain' },
  { name: 'rehost', moves: true, point: 'rehost' },
  { name: 'relocate', moves: true, point: 'relocate' },
  { name: 'repurchase', moves: true, point: 'repurchase' },
  { name: 'replatform', moves: true, point: 'replatform' },
  { name: 'refactor', moves: true, point: 'refactor' }
];

export const PATH_NAMES = PATHS.map((p) => p.name);

// The levels of a finding, from the lowest.
export const LEVELS = ['info', 'warning', 'error'];

// The sentence every report ends with, before the result.
export const NOTICE = 'This plan is built from the inventory as it is written. It does not discover dependencies, read network traffic, size machines or check a target service, so a dependency the inventory does not list is not seen and the waves are only as right as the dependencies in the file (docs/limits.md).';
