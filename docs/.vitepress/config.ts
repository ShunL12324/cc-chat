import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'cc-chat',
  description: 'Discord bot that bridges Claude Code CLI to mobile devices',
  base: '/cc-chat/',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/cc-chat/logo.svg' }],
  ],

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Commands', link: '/commands' },
      {
        text: 'GitHub',
        link: 'https://github.com/ShunL12324/cc-chat',
      },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Discord Bot Setup', link: '/guide/discord-setup' },
          { text: 'Configuration', link: '/guide/configuration' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Commands', link: '/commands' },
          { text: 'Architecture', link: '/architecture' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/ShunL12324/cc-chat' },
    ],

    footer: {
      message: 'Released under the MIT License.',
    },

    search: {
      provider: 'local',
    },
  },
})
