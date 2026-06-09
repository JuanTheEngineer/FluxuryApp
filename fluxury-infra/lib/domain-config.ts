// Domain configuration for FluxuryApp
// Using subdirectory approach: juantheengineer.com/fluxury

export interface DomainConfig {
  rootDomain: string;
  appPath: string;
  apiSubdomain?: string;
  cdnSubdomain?: string;
  environment: 'beta' | 'production';
}

export const betaDomainConfig: DomainConfig = {
  rootDomain: 'juantheengineer.com',
  appPath: '/fluxury',
  apiSubdomain: 'api.juantheengineer.com',
  cdnSubdomain: 'cdn.juantheengineer.com',
  environment: 'beta'
};

export const productionDomainConfig: DomainConfig = {
  rootDomain: 'juantheengineer.com',
  appPath: '/fluxury',
  apiSubdomain: 'api.juantheengineer.com',
  cdnSubdomain: 'cdn.juantheengineer.com',
  environment: 'production'
};

// URL builders
export const buildAppUrl = (config: DomainConfig): string => {
  return `https://${config.rootDomain}${config.appPath}`;
};

export const buildApiUrl = (config: DomainConfig): string => {
  return config.apiSubdomain ? `https://${config.apiSubdomain}` : '';
};

export const buildCdnUrl = (config: DomainConfig): string => {
  return config.cdnSubdomain ? `https://${config.cdnSubdomain}` : '';
};