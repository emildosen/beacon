import { readdir, readFile, writeFile, mkdir } from 'fs/promises'
import { join, basename, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '../..')
const rulesDir = join(rootDir, 'rules')
const docsRulesDir = join(rootDir, 'docs/rules')
const sidebarPath = join(rootDir, 'docs/.vitepress/rules-sidebar.ts')

interface RuleCondition {
  field: string
  operator: string
  value: string
}

interface Rule {
  name: string
  description: string
  severity: string
  enabled: boolean
  source: string
  tenantIds?: string[]
  mitre?: {
    tactic: string
    technique: string
    subtechnique?: string
  }
  conditions: {
    match: string
    rules: RuleCondition[]
  }
  meta?: {
    author?: string
    created?: string
  }
}

interface CategoryRules {
  [category: string]: Rule[]
}

const displayNameOverrides: Record<string, string> = {
  'ediscovery': 'eDiscovery',
  'sharepoint': 'SharePoint',
}

function toDisplayName(folderName: string): string {
  if (displayNameOverrides[folderName]) {
    return displayNameOverrides[folderName]
  }
  return folderName
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function toAnchor(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function escapeVue(text: string): string {
  // Insert word joiner between braces to prevent Vue template parsing
  // U+2060 prevents line breaks unlike zero-width space
  return text.replace(/\{\{/g, '{\u2060{').replace(/\}\}/g, '}\u2060}')
}

function severityEmoji(severity: string): string {
  switch (severity.toLowerCase()) {
    case 'critical': return '🔴'
    case 'high': return '🟠'
    case 'medium': return '🟡'
    case 'low': return '🟢'
    default: return '⚪'
  }
}

function mitreLink(technique: string, subtechnique?: string): string {
  const id = subtechnique || technique
  const url = subtechnique
    ? `https://attack.mitre.org/techniques/${technique}/${subtechnique.split('.')[1]}/`
    : `https://attack.mitre.org/techniques/${technique}/`
  return `[${id}](${url})`
}

async function getCategories(): Promise<string[]> {
  const entries = await readdir(rulesDir, { withFileTypes: true })
  return entries
    .filter(e => e.isDirectory())
    .map(e => e.name)
}

async function getRulesForCategory(category: string): Promise<Rule[]> {
  const categoryDir = join(rulesDir, category)
  const files = await readdir(categoryDir)

  const jsonFiles = files.filter(f => {
    if (!f.endsWith('.json')) return false
    if (category === 'client-specific') {
      return f.endsWith('.template.json')
    }
    return true
  })

  const rules: Rule[] = []
  for (const file of jsonFiles) {
    const content = await readFile(join(categoryDir, file), 'utf-8')
    rules.push(JSON.parse(content))
  }

  return rules.sort((a, b) => a.name.localeCompare(b.name))
}

function generateCategoryPage(category: string, rules: Rule[]): string {
  const displayName = toDisplayName(category)
  const lines: string[] = []

  lines.push('---')
  lines.push(`title: ${displayName} Rules`)
  lines.push('---')
  lines.push('')
  lines.push(`# ${displayName} Rules`)
  lines.push('')
  lines.push(`${rules.length} detection rule${rules.length === 1 ? '' : 's'} in this category.`)
  lines.push('')

  // Summary table
  lines.push('| Rule | Severity | MITRE | Source |')
  lines.push('|------|----------|-------|--------|')
  for (const rule of rules) {
    const mitre = rule.mitre
      ? mitreLink(rule.mitre.technique, rule.mitre.subtechnique)
      : '—'
    lines.push(`| [${rule.name}](#${toAnchor(rule.name)}) | ${rule.severity} | ${mitre} | ${rule.source} |`)
  }
  lines.push('')

  // Individual rule sections
  for (const rule of rules) {
    lines.push('---')
    lines.push('')
    lines.push(`### ${rule.name}`)
    lines.push('')

    // Properties table
    lines.push('| Property | Value |')
    lines.push('|----------|-------|')
    lines.push(`| Severity | ${severityEmoji(rule.severity)} ${rule.severity} |`)
    lines.push(`| Source | ${rule.source} |`)
    if (rule.mitre) {
      lines.push(`| MITRE | ${mitreLink(rule.mitre.technique, rule.mitre.subtechnique)} (${rule.mitre.tactic}) |`)
    }
    lines.push('')

    lines.push(rule.description)
    lines.push('')

    // Conditions
    lines.push('<details>')
    lines.push('<summary>Conditions</summary>')
    lines.push('')
    lines.push(`- Match: **${rule.conditions.match}**`)
    for (const cond of rule.conditions.rules) {
      const valueDisplay = cond.value ? ` \`${escapeVue(cond.value)}\`` : ''
      lines.push(`- \`${cond.field}\` ${cond.operator}${valueDisplay}`)
    }
    lines.push('')
    lines.push('</details>')
    lines.push('')
  }

  return lines.join('\n')
}

function generateIndexPage(categoryRules: CategoryRules): string {
  const lines: string[] = []
  const totalRules = Object.values(categoryRules).reduce((sum, rules) => sum + rules.length, 0)

  lines.push('---')
  lines.push('title: Rules Overview')
  lines.push('---')
  lines.push('')
  lines.push('# Rules Overview')
  lines.push('')
  lines.push(`Beacon includes **${totalRules} detection rules** across ${Object.keys(categoryRules).length} categories.`)
  lines.push('')
  lines.push('| Category | Rules | Description |')
  lines.push('|----------|-------|-------------|')

  const descriptions: Record<string, string> = {
    'applications': 'OAuth apps, service principals, and app registrations',
    'compliance': 'DLP policies, audit logging, and compliance settings',
    'ediscovery': 'eDiscovery searches and exports',
    'exchange': 'Inbox rules, mail flow, and Exchange Online security',
    'identity': 'Admin roles, MFA, conditional access, and federation',
    'security-alerts': 'Microsoft Defender security alerts',
    'sharepoint': 'SharePoint and OneDrive file sharing',
    'sign-in': 'Sign-in risk detections and anomalies',
    'client-specific': 'Tenant-specific rule templates',
  }

  for (const [category, rules] of Object.entries(categoryRules).sort()) {
    const displayName = toDisplayName(category)
    const desc = descriptions[category] || ''
    lines.push(`| [${displayName}](./${category}.md) | ${rules.length} | ${desc} |`)
  }

  lines.push('')
  return lines.join('\n')
}

function generateSidebar(categoryRules: CategoryRules): string {
  const items = Object.entries(categoryRules)
    .sort()
    .map(([category, rules]) => {
      const displayName = toDisplayName(category)
      return `    { text: '${displayName} (${rules.length})', link: '/rules/${category}' }`
    })
    .join(',\n')

  return `export const rulesSidebar = {
  text: 'Rules',
  items: [
    { text: 'Overview', link: '/rules/' },
${items}
  ]
}
`
}

async function main() {
  console.log('Generating rules documentation...')

  // Create output directory
  await mkdir(docsRulesDir, { recursive: true })

  // Load all rules by category
  const categories = await getCategories()
  const categoryRules: CategoryRules = {}

  for (const category of categories) {
    const rules = await getRulesForCategory(category)
    if (rules.length > 0) {
      categoryRules[category] = rules
      console.log(`  ${toDisplayName(category)}: ${rules.length} rules`)
    }
  }

  // Generate category pages
  for (const [category, rules] of Object.entries(categoryRules)) {
    const content = generateCategoryPage(category, rules)
    await writeFile(join(docsRulesDir, `${category}.md`), content)
  }

  // Generate index page
  const indexContent = generateIndexPage(categoryRules)
  await writeFile(join(docsRulesDir, 'index.md'), indexContent)

  // Generate sidebar config
  const sidebarContent = generateSidebar(categoryRules)
  await writeFile(sidebarPath, sidebarContent)

  const totalRules = Object.values(categoryRules).reduce((sum, rules) => sum + rules.length, 0)
  console.log(`\nGenerated ${totalRules} rules across ${Object.keys(categoryRules).length} categories`)
  console.log(`Output: ${docsRulesDir}`)
}

main().catch(console.error)
