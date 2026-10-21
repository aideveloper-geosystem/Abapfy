export type SkillCategory =
  'abap' | 'ai' | 'btp' | 'cap' | 'data-analytics' | 'hana' | 'tooling' | 'ui-development'

export interface BuiltinSkill {
  slug: string
  name: string
  category: SkillCategory
  summary: string
  description: string
}

export const SKILL_CATEGORY_LABELS: Record<SkillCategory, string> = {
  abap: 'ABAP',
  ai: 'Inteligência Artificial',
  btp: 'BTP',
  cap: 'CAP',
  'data-analytics': 'Dados & Analytics',
  hana: 'HANA',
  tooling: 'Ferramentas',
  'ui-development': 'Desenvolvimento de UI'
}

/**
 * Catálogo estático das skills que acompanham o Abapfy, gerado a partir dos
 * plugin.json em src/renderer/src/skills/<slug>/.claude-plugin/plugin.json.
 * Ainda não conectado ao modelo — só controla o toggle ativo/inativo por usuário.
 */
export const BUILTIN_SKILLS: BuiltinSkill[] = [
  {
    slug: 'sap-abap',
    name: 'SAP ABAP',
    category: 'abap',
    summary: 'Comprehensive ABAP development skill for SAP systems.',
    description:
      'Comprehensive ABAP development skill for SAP systems. Use when writing ABAP code, working with internal tables, structures, ABAP SQL, object-oriented programming, RAP (RESTful Application Programming Model), CDS views, EML statements, ABAP Cloud development, string processing, dynamic programming, RTTI/RTTC, field symbols, data references, exception handling, or ABAP unit testing. Covers both classic ABAP and modern ABAP for Cloud Development patterns.'
  },
  {
    slug: 'sap-abap-cds',
    name: 'SAP ABAP CDS',
    category: 'abap',
    summary:
      'Comprehensive SAP ABAP CDS (Core Data Services) reference for data modeling, view development, and semantic enrichment.',
    description:
      'Comprehensive SAP ABAP CDS (Core Data Services) reference for data modeling, view development, and semantic enrichment. Use when creating CDS views or view entities, defining data models with annotations, working with associations and cardinality, implementing input parameters, using built-in functions, writing CASE expressions, implementing access control with DCL, handling CURR/QUAN data types, troubleshooting CDS errors, querying CDS views from ABAP, or displaying data with SALV IDA. Covers ABAP 7.4+ through ABAP Cloud.'
  },
  {
    slug: 'sap-ai-core',
    name: 'SAP AI Core',
    category: 'ai',
    summary:
      'Guides development with SAP AI Core and SAP AI Launchpad for enterprise AI/ML workloads on SAP BTP.',
    description:
      'Guides development with SAP AI Core and SAP AI Launchpad for enterprise AI/ML workloads on SAP BTP. Use when: deploying generative AI models (GPT, Llama, Gemini, Mistral), building orchestration workflows with templating/filtering/grounding, implementing RAG with vector databases, managing ML training pipelines with Argo Workflows, configuring content filtering and data masking for PII protection, using the Generative AI Hub for prompt experimentation, or integrating AI capabilities into SAP applications. Covers service plans (Free/Standard/Extended), model providers (Azure OpenAI, AWS Bedrock, GCP Vertex AI, Mistral, IBM), orchestration modules, embeddings, tool calling, and structured outputs.'
  },
  {
    slug: 'sap-api-style',
    name: 'SAP API Style',
    category: 'tooling',
    summary:
      'This skill provides comprehensive guidance for documenting SAP APIs following the SAP API Style Guide standards.',
    description:
      'This skill provides comprehensive guidance for documenting SAP APIs following the SAP API Style Guide standards. It should be used when creating or reviewing API documentation for REST, OData, Java, JavaScript, .NET, or C/C++ APIs. The skill covers naming conventions, documentation comments, OpenAPI specifications, quality checklists, deprecation policies, and manual documentation templates. It ensures consistency with SAP API Business Hub standards and industry best practices. Keywords: SAP API, REST, OData, OpenAPI, Swagger, Javadoc, JSDoc, XML documentation, API Business Hub, API naming, API deprecation, x-sap-stateInfo, Entity Data Model, EDM, documentation tags, API quality, API templates'
  },
  {
    slug: 'sap-btp-best-practices',
    name: 'SAP BTP Best Practices',
    category: 'btp',
    summary:
      'Production-ready SAP BTP best practices for enterprise architecture, account management, security, and operations.',
    description:
      'Production-ready SAP BTP best practices for enterprise architecture, account management, security, and operations. Use when planning BTP implementations, setting up account hierarchies, configuring environments, implementing authentication, designing CI/CD pipelines, establishing governance, building Platform Engineering teams, implementing failover strategies, or managing application lifecycle on SAP BTP. Keywords: SAP BTP, account hierarchy, global account, directory, subaccount, Cloud Foundry, Kyma, ABAP, SAP Identity Authentication, CI/CD, governance, Platform Engineering, failover, multi-region, SAP BTP best practices'
  },
  {
    slug: 'sap-btp-build-work-zone-advanced',
    name: 'SAP BTP Build Work Zone Advanced',
    category: 'btp',
    summary:
      'Develops and administers SAP Build Work Zone, advanced edition digital workplace solutions.',
    description:
      'Develops and administers SAP Build Work Zone, advanced edition digital workplace solutions. Use when creating workspaces, workpages, and collaborative sites, developing UI Integration Cards in SAP Business Application Studio, building content packages and workspace templates, integrating with Microsoft 365/Teams/SharePoint/Google Drive, configuring chatbots and webhooks, implementing SCIM API user provisioning, setting up OData business records, managing themes and branding, configuring role-based access and SSO, troubleshooting deployment issues, or working with the Administration Console. Keywords: SAP Build Work Zone advanced edition, digital workplace, UI Integration Cards, content packages, workspace templates, SAP Business Application Studio, SAP Conversational AI, SCIM API, OData, Microsoft Teams integration, SSO, theming, Administration Console'
  },
  {
    slug: 'sap-btp-business-application-studio',
    name: 'SAP BTP Business Application Studio',
    category: 'btp',
    summary:
      'This skill provides comprehensive guidance for SAP Business Application Studio (BAS), the cloud-based IDE on SAP BTP built on Code-OSS.',
    description:
      'This skill provides comprehensive guidance for SAP Business Application Studio (BAS), the cloud-based IDE on SAP BTP built on Code-OSS. Use when setting up BAS subscriptions, creating dev spaces, connecting to external systems, deploying MTA applications, troubleshooting connectivity issues, managing Git repositories, configuring runtime versions, or using the layout editor. Keywords: SAP Business Application Studio, BAS, SAP BTP, dev space, Cloud Foundry, MTA, multitarget application, SAP Fiori, CAP, HANA, destination, WebIDEEnabled, Cloud Connector, Service Center, Storyboard, Layout Editor, ABAP, OData, subscription, entitlements, role collection, Business_Application_Studio_Developer, Git, clone, push, pull, Gerrit, PAT, OAuth, asdf, runtime, Node.js, Java, Python, Task Explorer, CI/CD, Yeoman, generator, template wizard, mbt, mtar, debugging, breakpoint'
  },
  {
    slug: 'sap-btp-cias',
    name: 'SAP BTP CIAS',
    category: 'btp',
    summary:
      'SAP BTP Cloud Integration Automation Service (CIAS) skill for guided integration workflows.',
    description:
      'SAP BTP Cloud Integration Automation Service (CIAS) skill for guided integration workflows. Use when: setting up CIAS subscriptions, configuring destinations, assigning roles (CIASIntegrationAdministrator, CIASIntegrationExpert, CIASIntegrationMonitor), planning integration scenarios, working with My Inbox tasks, monitoring scenario execution, troubleshooting CIAS errors, creating OAuth2 instances, configuring identity providers for CIAS, understanding CIAS security architecture, or integrating SAP products (S/4HANA, SuccessFactors, BTP services, SAP Build, IBP).'
  },
  {
    slug: 'sap-btp-cloud-logging',
    name: 'SAP BTP Cloud Logging',
    category: 'btp',
    summary: 'This skill provides comprehensive guidance for SAP Cloud Logging service on SAP BTP.',
    description:
      'This skill provides comprehensive guidance for SAP Cloud Logging service on SAP BTP. Use when setting up Cloud Logging instances, configuring log ingestion from Cloud Foundry or Kyma runtimes, implementing OpenTelemetry observability, analyzing logs/metrics/traces in OpenSearch Dashboards, configuring SAML authentication, managing certificates, or troubleshooting ingestion issues. Covers service plans (dev/standard/large), all 4 instance creation methods (BTP Cockpit, CF CLI, BTP CLI, Service Operator), all 4 ingestion methods (Cloud Foundry, Kyma, OpenTelemetry, JSON API), and security best practices.'
  },
  {
    slug: 'sap-btp-cloud-platform',
    name: 'SAP BTP Cloud Platform',
    category: 'btp',
    summary:
      'Comprehensive SAP Business Technology Platform (BTP) reference for cloud development, deployment, and operations.',
    description:
      'Comprehensive SAP Business Technology Platform (BTP) reference for cloud development, deployment, and operations. Use when setting up BTP accounts, working with Cloud Foundry environment, deploying to Kyma (Kubernetes, serverless), developing in ABAP environment (RAP, CDS), managing entitlements and quotas, configuring identity providers (XSUAA), using btp CLI or CF CLI, deploying multi-target applications (MTA), setting up connectivity (destinations, Cloud Connector), implementing CI/CD pipelines, extending SAP solutions, or troubleshooting BTP services. Covers all three runtime environments.'
  },
  {
    slug: 'sap-btp-cloud-transport-management',
    name: 'SAP BTP Cloud Transport Management',
    category: 'btp',
    summary: 'Comprehensive skill for SAP Cloud Transport Management service on SAP BTP.',
    description:
      'Comprehensive skill for SAP Cloud Transport Management service on SAP BTP. Use when setting up transport landscapes, configuring transport nodes and routes, managing import queues, deploying MTAs across Cloud Foundry environments, integrating with CI/CD pipelines, configuring ABAP environment transports, troubleshooting deployment errors, or implementing change management workflows. Covers entitlements, subscriptions, role collections, service instances, destinations, and API integrations.'
  },
  {
    slug: 'sap-btp-connectivity',
    name: 'SAP BTP Connectivity',
    category: 'btp',
    summary:
      'SAP BTP Connectivity skill covering Destination Service, Connectivity Service, Cloud Connector, Connectivity Proxy, and Transparent Proxy for Kubernetes.',
    description:
      'SAP BTP Connectivity skill covering Destination Service, Connectivity Service, Cloud Connector, Connectivity Proxy, and Transparent Proxy for Kubernetes. Use when configuring destinations (HTTP, RFC, LDAP, MAIL, TCP), setting up cloud-to-on-premise connectivity, implementing OAuth and principal propagation, deploying connectivity proxies in Kubernetes/Kyma, troubleshooting connectivity errors (405, 407, 503), or configuring multitenancy.'
  },
  {
    slug: 'sap-btp-developer-guide',
    name: 'SAP BTP Developer Guide',
    category: 'btp',
    summary:
      'Develops business applications on SAP Business Technology Platform (BTP) using CAP (Node.js/Java) or ABAP Cloud.',
    description:
      'Develops business applications on SAP Business Technology Platform (BTP) using CAP (Node.js/Java) or ABAP Cloud. Use when: building cloud applications on SAP BTP, deploying to Cloud Foundry or Kyma runtimes, integrating with SAP HANA Cloud, implementing SAP Fiori UIs, connecting to remote SAP systems, building multitenant SaaS applications, extending SAP S/4HANA or SuccessFactors, setting up CI/CD pipelines, implementing observability, or following SAP development best practices. Keywords: SAP BTP, Business Technology Platform, CAP, Cloud Application Programming Model, ABAP Cloud, Cloud Foundry, Kyma, SAP HANA Cloud, SAP Fiori, SAPUI5, CI/CD, observability, multitenant, SaaS, SAP BTP ABAP environment, SAP Business Application Studio, SAP Cloud SDK, SAP Integration Suite, SAP Event Mesh, SAP Connectivity Service, SAP Destination Service, XSUAA, OAuth, OpenID Connect, OData, CDS, Core Data Services, ABAP CDS, ABAP RESTful Application Programming Model, RAP, ABAP development, SAP BTP development'
  },
  {
    slug: 'sap-btp-integration-suite',
    name: 'SAP BTP Integration Suite',
    category: 'btp',
    summary: 'Enterprise integration solutions using SAP Integration Suite on BTP.',
    description:
      'Enterprise integration solutions using SAP Integration Suite on BTP. Covers Cloud Integration (iFlows), API Management, Event Mesh, Edge Integration Cell, Integration Advisor, Trading Partner Management, and Migration Assessment. Use for building integration flows, managing API proxies, event-driven architectures, B2B/EDI integrations, hybrid deployments, adapter configuration, Groovy/JavaScript message processing, and troubleshooting.'
  },
  {
    slug: 'sap-btp-intelligent-situation-automation',
    name: 'SAP BTP Intelligent Situation Automation',
    category: 'btp',
    summary:
      'This skill provides comprehensive guidance for SAP BTP Intelligent Situation Automation setup, configuration, and operations.',
    description:
      'This skill provides comprehensive guidance for SAP BTP Intelligent Situation Automation setup, configuration, and operations. It should be used when implementing situation-based automation between SAP S/4HANA systems and SAP Business Technology Platform. The skill covers subscription setup, Event Mesh integration, destination configuration, system onboarding, user management with role collections, automatic situation resolution, and troubleshooting. Keywords: SAP BTP, Intelligent Situation Automation, ISA, situation handling, SAP S/4HANA, SAP S/4HANA Cloud, Event Mesh, Business Event Handling, situation automation, situation dashboard, analyze situations, SAP_COM_0345, SAP_COM_0376, SAP_COM_0092, SituationAutomationKeyUser, SituationAutomationAdminUser, Cloud Connector, cf-eu10, CA-SIT-ATM, business situations, situation types, situation actions'
  },
  {
    slug: 'sap-btp-job-scheduling',
    name: 'SAP BTP Job Scheduling',
    category: 'btp',
    summary:
      'This skill provides comprehensive guidance for SAP BTP Job Scheduling Service development, configuration, and operations.',
    description:
      'This skill provides comprehensive guidance for SAP BTP Job Scheduling Service development, configuration, and operations. It should be used when creating, managing, or troubleshooting scheduled jobs on SAP Business Technology Platform. The skill covers service setup, REST API usage, schedule types and formats, OAuth 2.0 authentication, multitenancy, Cloud Foundry tasks, Kyma runtime integration, and monitoring with SAP Cloud ALM and Alert Notification Service. Keywords: SAP BTP, Job Scheduling, jobscheduler, cron, schedule, recurring jobs, one-time jobs, Cloud Foundry tasks, CF tasks, Kyma, OAuth 2.0, XSUAA, @sap/jobs-client, REST API, asynchronous jobs, action endpoint, run logs, SAP Cloud ALM, Alert Notification Service, multitenancy, tenant-aware, BC-CP-CF-JBS'
  },
  {
    slug: 'sap-btp-master-data-integration',
    name: 'SAP BTP Master Data Integration',
    category: 'btp',
    summary:
      'Configures and integrates SAP Master Data Integration (MDI) service on SAP Business Technology Platform.',
    description:
      'Configures and integrates SAP Master Data Integration (MDI) service on SAP Business Technology Platform. Use when setting up MDI tenants, connecting applications (S/4HANA, SuccessFactors, Ariba, Fieldglass, etc.), configuring distribution models, SOAP APIs for business partners, extensibility, or troubleshooting master data replication. Covers One Domain Model integration, Business Data Orchestration, client authentication (OAuth2, mTLS), and security configurations.'
  },
  {
    slug: 'sap-btp-service-manager',
    name: 'SAP BTP Service Manager',
    category: 'btp',
    summary:
      'This skill provides comprehensive knowledge for SAP Service Manager on SAP Business Technology Platform (BTP).',
    description:
      'This skill provides comprehensive knowledge for SAP Service Manager on SAP Business Technology Platform (BTP). It should be used when managing service instances, bindings, brokers, and platforms across Cloud Foundry, Kyma, Kubernetes, and other environments. Use when provisioning services via SMCTL CLI, BTP CLI, or REST APIs, configuring OAuth2 authentication, working with the SAP BTP Service Operator in Kubernetes, troubleshooting service consumption issues, or implementing cross-environment service management. Keywords: SAP Service Manager, BTP, service instances, service bindings, SMCTL, service broker, OSBAPI, Cloud Foundry, Kyma, Kubernetes, service-manager, service-operator-access, subaccount-admin, OAuth2, X.509, service marketplace, service plans, rate limiting, cf create-service, btp create services/instance, ServiceInstance CRD, ServiceBinding CRD'
  },
  {
    slug: 'sap-cap-capire',
    name: 'SAP CAP Capire',
    category: 'cap',
    summary:
      'SAP Cloud Application Programming Model (CAP) development skill using Capire documentation.',
    description:
      'SAP Cloud Application Programming Model (CAP) development skill using Capire documentation. Use when: building CAP applications, defining CDS models, implementing services, working with SAP HANA/SQLite/PostgreSQL databases, deploying to SAP BTP Cloud Foundry or Kyma, implementing Fiori UIs, handling authorization, multitenancy, or messaging. Covers CDL/CQL/CSN syntax, Node.js and Java runtimes, event handlers, OData services, and CAP plugins.'
  },
  {
    slug: 'sap-cloud-sdk-ai',
    name: 'SAP Cloud SDK AI',
    category: 'ai',
    summary: 'Integrates SAP Cloud SDK for AI into JavaScript/TypeScript and Java applications.',
    description:
      'Integrates SAP Cloud SDK for AI into JavaScript/TypeScript and Java applications. Use when building applications with SAP AI Core, Generative AI Hub, or Orchestration Service. Covers chat completion, embedding, streaming, function calling, content filtering, data masking, document grounding, prompt registry, and LangChain/Spring AI integration. Supports OpenAI GPT-4o, Llama, Gemini, Amazon Nova, and other foundation models via SAP BTP.'
  },
  {
    slug: 'sap-datasphere',
    name: 'SAP Datasphere',
    category: 'data-analytics',
    summary:
      'SAP Datasphere development skill with 3 specialized agents, 5 slash commands, and validation hooks.',
    description:
      'SAP Datasphere development skill with 3 specialized agents, 5 slash commands, and validation hooks. Use when building data warehouses on SAP BTP, creating analytic models, configuring data flows and replication flows, setting up connections, managing spaces and users, implementing data access controls, or using the datasphere CLI. Covers Data Builder, Business Builder, analytic models, 40+ connection types, real-time replication, task chains, content transport, and data marketplace.'
  },
  {
    slug: 'sap-fiori-tools',
    name: 'SAP Fiori Tools',
    category: 'ui-development',
    summary:
      'Develops SAP Fiori applications using SAP Fiori tools extensions for VS Code and SAP Business Application Studio.',
    description:
      'Develops SAP Fiori applications using SAP Fiori tools extensions for VS Code and SAP Business Application Studio. Use when: generating Fiori Elements or Freestyle SAPUI5 applications, configuring Page Editor for List Report or Object Page, working with annotations and Service Modeler, setting up deployment to ABAP or Cloud Foundry, creating adaptation projects, using Guided Development, previewing with mock data or live data, configuring SAP Fiori launchpad, or using AI-powered generation with Project Accelerator/Joule. Technologies: SAP Fiori Elements, SAPUI5, OData V2/V4, CAP, SAP BTP, ABAP, Cloud Foundry, fiori-mcp-server (MCP tools for AI-assisted generation).'
  },
  {
    slug: 'sap-hana-cli',
    name: 'SAP HANA CLI',
    category: 'hana',
    summary:
      'Assists with SAP HANA Developer CLI (hana-cli) for database development and administration.',
    description:
      'Assists with SAP HANA Developer CLI (hana-cli) for database development and administration. Use when: installing hana-cli, connecting to SAP HANA databases, inspecting database objects (tables, views, procedures, functions), managing HDI containers, executing SQL queries, converting metadata to CDS/EDMX/OpenAPI formats, managing SAP HANA Cloud instances, working with BTP CLI integration, or troubleshooting hana-cli commands. Covers: 91 commands, 17+ output formats, HDI container management, cloud operations.'
  },
  {
    slug: 'sap-hana-cloud-data-intelligence',
    name: 'SAP HANA Cloud Data Intelligence',
    category: 'hana',
    summary:
      'Develops data processing pipelines, integrations, and machine learning scenarios in SAP Data Intelligence Cloud.',
    description:
      'Develops data processing pipelines, integrations, and machine learning scenarios in SAP Data Intelligence Cloud. Use when building graphs/pipelines with operators, integrating ABAP/S4HANA systems, creating replication flows, developing ML scenarios with JupyterLab, or using Data Transformation Language functions. Covers Gen1/Gen2 operators, subengines (Python, Node.js, C++), structured data operators, and repository objects.'
  },
  {
    slug: 'sap-hana-ml',
    name: 'SAP HANA ML',
    category: 'hana',
    summary: 'SAP HANA Machine Learning Python Client (hana-ml) development skill.',
    description:
      "SAP HANA Machine Learning Python Client (hana-ml) development skill. Use when: Building ML solutions with SAP HANA's in-database machine learning using Python hana-ml library for PAL/APL algorithms, DataFrame operations, AutoML, model persistence, and visualization. Keywords: hana-ml, SAP HANA, machine learning, PAL, APL, predictive analytics, HANA DataFrame, ConnectionContext, classification, regression, clustering, time series, ARIMA, gradient boosting, AutoML, SHAP, model storage"
  },
  {
    slug: 'sap-sac-custom-widget',
    name: 'SAP SAC Custom Widget',
    category: 'data-analytics',
    summary: 'SAP Analytics Cloud (SAC) Custom Widget development.',
    description:
      'SAP Analytics Cloud (SAC) Custom Widget development. Use when building custom visualizations, extending SAC with Web Components, or creating Widget Add-Ons. Covers JSON metadata, JavaScript Web Components, lifecycle functions, data binding with feeds, styling/builder panels, property/event/method definitions, third-party library integration, hosting, security, performance, and debugging. Includes Widget Add-On feature (QRC Q4 2023+) and templates for widgets, charts, and KPI cards.'
  },
  {
    slug: 'sap-sac-planning',
    name: 'SAP SAC Planning',
    category: 'data-analytics',
    summary:
      'This skill should be used when developing SAP Analytics Cloud (SAC) planning applications, including building planning-enabled stories, analytics designer applications with planning functionality, data actions, multi actions, version management, and planning workflows.',
    description:
      'This skill should be used when developing SAP Analytics Cloud (SAC) planning applications, including building planning-enabled stories, analytics designer applications with planning functionality, data actions, multi actions, version management, and planning workflows. Use when creating planning models, implementing data entry forms, configuring spreading/distribution/allocation, setting up data locking, building calendar-based planning processes with approval workflows, writing JavaScript scripts for planning automation, using the getPlanning() API, PlanningModel API, or DataSource API for planning scenarios, troubleshooting planning performance issues, integrating predictive forecasting into planning workflows, implementing Seamless Planning with SAP Datasphere, configuring BPC live connections for BW on HANA integration, building value driver trees for what-if analysis, or debugging data actions with tracing.'
  },
  {
    slug: 'sap-sac-scripting',
    name: 'SAP SAC Scripting',
    category: 'data-analytics',
    summary:
      'Comprehensive SAC scripting skill for SAP Analytics Cloud Analytics Designer and Optimized Story Experience.',
    description:
      'Comprehensive SAC scripting skill for SAP Analytics Cloud Analytics Designer and Optimized Story Experience. This skill should be used when the user asks to "create SAC script", "debug Analytics Designer", "optimize SAC performance", "planning operations in SAC", "filter data in SAC", "use DataSource API", "chart scripting", "table manipulation", "SAC event handlers", "version management", "data locking", "Optimized Story Experience API", "OSE scripting", "OSE widget API", "OSE DataSource", "story scripting API", "OSE planning API", "OSE method", "optimized story", "SAC story scripting", "story script", "SAC scripting", or works with SAC widgets, planning models, or analytics applications.'
  },
  {
    slug: 'sap-sqlscript',
    name: 'SAP SQLScript',
    category: 'data-analytics',
    summary:
      'This skill should be used when the user asks to "write a SQLScript procedure", "create HANA stored procedure", "implement AMDP method", "optimize SQLScript performance", "handle SQLScript exceptions", "debug HANA procedure", "create table function", or mentions SQLScript, SAP HANA procedures, AMDP, EXIT HANDLER, or code-to-data paradigm.',
    description:
      'This skill should be used when the user asks to "write a SQLScript procedure", "create HANA stored procedure", "implement AMDP method", "optimize SQLScript performance", "handle SQLScript exceptions", "debug HANA procedure", "create table function", or mentions SQLScript, SAP HANA procedures, AMDP, EXIT HANDLER, or code-to-data paradigm. Comprehensive SQLScript development guidance for SAP HANA database programming including syntax patterns, built-in functions, exception handling, performance optimization, cursor management, and ABAP Managed Database Procedure (AMDP) integration.'
  },
  {
    slug: 'sapui5',
    name: 'SAPUI5',
    category: 'ui-development',
    summary:
      'This skill should be used when developing SAP UI5 applications, including creating freestyle apps, Fiori Elements apps, custom controls, testing, data binding, OData integration, routing, and troubleshooting.',
    description:
      'This skill should be used when developing SAP UI5 applications, including creating freestyle apps, Fiori Elements apps, custom controls, testing, data binding, OData integration, routing, and troubleshooting. Use when building enterprise web applications with SAP UI5 framework, implementing MVC patterns, configuring manifest.json, creating XML views, writing controllers, setting up data models (JSON, OData v2/v4), implementing responsive UI with sap.m controls, building Fiori Elements apps, writing unit tests with QUnit, integration tests with OPA5, setting up mock servers, handling security (XSS, CSP), optimizing performance, implementing accessibility features, or debugging UI5 applications. Also covers sap.ui.mdc controls and TypeScript control libraries.'
  },
  {
    slug: 'sapui5-cli',
    name: 'SAPUI5 CLI',
    category: 'ui-development',
    summary: 'Manages SAPUI5/OpenUI5 projects using the UI5 Tooling CLI (@ui5/cli).',
    description:
      'Manages SAPUI5/OpenUI5 projects using the UI5 Tooling CLI (@ui5/cli). Use when initializing UI5 projects, configuring ui5.yaml or ui5-workspace.yaml files, building UI5 applications or libraries, running development servers with HTTP/2 support, creating custom build tasks or server middleware, managing workspace/monorepo setups, troubleshooting UI5 CLI errors, migrating between UI5 CLI versions, or optimizing build performance. Supports both OpenUI5 and SAPUI5 frameworks with complete configuration and extensibility guidance.'
  },
  {
    slug: 'sapui5-linter',
    name: 'SAPUI5 Linter',
    category: 'ui-development',
    summary:
      'Use this skill when working with the UI5 Linter (@ui5/linter) for static code analysis of SAPUI5/OpenUI5 applications and libraries.',
    description:
      'Use this skill when working with the UI5 Linter (@ui5/linter) for static code analysis of SAPUI5/OpenUI5 applications and libraries. Covers setup, configuring linting rules, running the linter to detect deprecated APIs, global variable usage, CSP violations, and manifest issues. Supports autofix for deprecated API usage, global references, event handlers, and manifest properties. Includes CI/CD integration, pre-commit hooks, and UI5 2.x migration preparation.'
  }
]
