import { createContext, useContext } from "react";

interface AuthContextType {
    token: string;
    userId: number;
    username: string;
}

export const AuthContext = createContext<AuthContextType | null >(null);

export const useAuth = (): AuthContextType => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    // return safe defaults instead of throwing — prevents blank screen
    return { token: '', userId: 0, username: '' };
  }
  return ctx;
};