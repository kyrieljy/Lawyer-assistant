export {};

declare global {
  interface Window {
    lawyerAPI: {
      call: (command: string, payload?: unknown) => Promise<any>;
      authMe: () => Promise<any>;
      login: (payload: { username: string; password: string }) => Promise<any>;
      register: (payload: { username: string; fullName: string; position: string; password: string; inviteCode: string }) => Promise<any>;
      logout: () => Promise<any>;
      businessLogs: () => Promise<any>;
      listUsers: () => Promise<any>;
      updateUser: (userId: string, payload: { active?: boolean; password?: string }) => Promise<any>;
      getInviteCode: () => Promise<any>;
      resetInviteCode: () => Promise<any>;
      uploadDatabase: () => Promise<any>;
      chooseFiles: () => Promise<string[]>;
      chooseDirectory: () => Promise<string>;
      chooseSavePath: (defaultName?: string) => Promise<string>;
      openInFolder: (path: string) => Promise<void>;
      platform: string;
    };
  }
}
