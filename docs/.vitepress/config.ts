import { defineConfig } from 'vitepress'

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
      { text: 'Setup', link: '/getting-started' },
      { text: 'Development', link: '/debugging-rules' }
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
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Rules', link: '/rules' }
        ]
      },
      {
        text: 'Development',
        items: [
          { text: 'Debugging Rules', link: '/debugging-rules' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/emildosen/beacon' }
    ]
  }
})
