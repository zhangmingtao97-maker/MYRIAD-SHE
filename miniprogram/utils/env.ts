export type MiniProgramEnvironment = 'dev' | 'prod';

// Switch this value before using the WeChat Developer Tools.
const ENV: MiniProgramEnvironment = 'dev';

const ENV_CONFIG: Record<MiniProgramEnvironment, { baseUrl: string }> = {
  dev: {
    baseUrl: 'http://192.168.1.32:61021/api',
  },
  prod: {
    baseUrl: 'https://hszfckga.com/api',
  },
};

export const API_BASE_URL = ENV_CONFIG[ENV].baseUrl;

