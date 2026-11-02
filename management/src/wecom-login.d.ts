export {};

declare global {
  interface Window {
    WwLogin?: new (options: {
      id: string;
      appid: string;
      agentid: string;
      redirect_uri: string;
      state: string;
      is_mobile?: boolean;
    }) => { destroyed?: () => void };
  }
}
