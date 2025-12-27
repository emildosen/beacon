import { defineConfig } from 'vitepress'

export default defineConfig({
  title: "Beacon",
  description: "Multi-tenant M365 security alerting for MSPs",
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Guide', link: '/getting-started' }
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Rules', link: '/rules' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/yourusername/beacon' }
    ]
  }
})
