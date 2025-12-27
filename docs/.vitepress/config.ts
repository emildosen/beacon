import { defineConfig } from 'vitepress'

// Import generated rules sidebar, fallback if not yet generated
let rulesSidebar = { text: 'Rules', items: [{ text: 'Overview', link: '/rules/' }] }
try {
  const mod = await import('./rules-sidebar.js')
  rulesSidebar = mod.rulesSidebar
} catch { /* use fallback */ }

export default defineConfig({
  title: "Beacon",
  titleTemplate: ':title | Beacon - M365 Security Alerting',
  description: "Multi-tenant M365 security alerting for MSPs",
  head: [
    ['link', { rel: 'icon', href: '/favicon.png' }]
  ],
  themeConfig: {
    logo: '/beacon.png',
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Introduction', link: '/overview' },
      { text: 'Setup', link: '/azure-deployment' },
      { text: 'Rules', link: '/rules' }
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'Overview', link: '/overview' }
        ]
      },
      {
        text: 'Setup',
        items: [
          { text: 'Azure Deployment', link: '/azure-deployment' },
          { text: 'Manual Deployment', link: '/manual-deployment' }
        ]
      },
      {
        text: 'Development',
        items: [
          { text: 'Debugging Rules', link: '/debugging-rules' }
        ]
      },
      rulesSidebar
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/emildosen/beacon' }
    ]
  }
})
