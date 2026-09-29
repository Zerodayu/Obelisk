// NOTE: single source of truth for product/branding metadata — apps import
// `app` from the shim in utils/app-info.ts (or straight from @obelisk/app-info).
export const app = {
  title: "Obelisk",
  version: "0.1.0",
  description:
    "Outcomes-based Educational Learning and Intelligent System Kit for Jose Maria College Foundation Inc.",
  legalTitle:
    "Obelisk – Outcomes-based Educational Learning and Intelligent System Kit for Jose Maria College Foundation Inc.",
  organization: "Jose Maria College Foundation Inc.",
  organizationAbbr: "JMCFI",
  logo: {
    light: "/metadata/obelisk-logo.svg",
    dark: "/metadata/obelisk-logo-dark.svg",
  },
} as const;

/** NOTE: alias kept for the original package export name. */
export const appINFO = app;
