import type { McpTransport } from '@renderer/store/mcpStore'

export type McpPresetId = 'sap_docs' | 'sap_abap' | 'ui5' | 'cap' | 'fiori' | 'sap_devs' | 'github' | 'playwright'

export interface McpPreset {
  id: McpPresetId
  slug: string
  name: string
  description: string
  transport: McpTransport
  url: string | null
  command: string | null
  args: string[]
  local?: { headers?: Record<string, string> }
  documentation: string
}

const npx = 'npx'

export const MCP_PRESETS: McpPreset[] = [
  { id: 'sap_docs', slug: 'sap-docs', name: 'SAP Docs', description: 'Pesquisa na documentação SAP.', transport: 'streamable_http', url: 'https://mcp-sap-docs.marianzeis.de/mcp', command: null, args: [], documentation: 'https://github.com/marianfoo/mcp-sap-docs' },
  { id: 'sap_abap', slug: 'sap-abap', name: 'SAP ABAP', description: 'Ferramentas ADT por perfil SAP local. Configure e verifique o perfil antes do uso.', transport: 'stdio', url: null, command: npx, args: ['--yes', '@coaspe/sap-abap-mcp@latest', 'serve', '--profile', 'DEV100'], documentation: 'https://github.com/Coaspe/sap-abap-mcp' },
  { id: 'ui5', slug: 'ui5', name: 'UI5', description: 'API, diretrizes, validação e lint UI5. Escolha a pasta local do projeto para as ferramentas de arquivo.', transport: 'stdio', url: null, command: npx, args: ['--yes', '@ui5/mcp-server'], documentation: 'https://github.com/UI5/mcp-server' },
  { id: 'cap', slug: 'cap', name: 'SAP CAP', description: 'Pesquisa em modelos CDS e documentação CAP. Defina a pasta do projeto.', transport: 'stdio', url: null, command: npx, args: ['--yes', '@cap-js/mcp-server'], documentation: 'https://github.com/cap-js/mcp-server' },
  { id: 'fiori', slug: 'fiori', name: 'SAP Fiori', description: 'Pesquisa e ferramentas para aplicações Fiori. Defina a pasta do projeto.', transport: 'stdio', url: null, command: npx, args: ['--yes', '@sap-ux/fiori-mcp-server', 'fiori-mcp'], documentation: 'https://github.com/SAP/open-ux-tools/blob/main/packages/fiori-mcp-server/README.md' },
  { id: 'sap_devs', slug: 'sap-devs', name: 'SAP Developers', description: 'Conhecimento SAP e inspeção BTP/Cloud Foundry. Requer sap-devs instalado.', transport: 'stdio', url: null, command: 'sap-devs', args: ['mcp', 'serve'], documentation: 'https://github.com/SAP-samples/sap-devs-cli/blob/main/docs/mcp-server.md' },
  { id: 'github', slug: 'github', name: 'GitHub', description: 'Repositórios, issues e pull requests. Requer token no ambiente local.', transport: 'streamable_http', url: 'https://api.githubcopilot.com/mcp/', command: null, args: [], local: { headers: { Authorization: 'Bearer ${GITHUB_MCP_TOKEN}' } }, documentation: 'https://github.com/github/github-mcp-server' },
  { id: 'playwright', slug: 'playwright', name: 'Playwright', description: 'Inspeção e automação de navegador em perfil isolado.', transport: 'stdio', url: null, command: npx, args: ['--yes', '@playwright/mcp', '--isolated'], documentation: 'https://github.com/microsoft/playwright-mcp' }
]
