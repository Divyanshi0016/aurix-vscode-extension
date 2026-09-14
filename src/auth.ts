import * as vscode from "vscode";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { logger } from "./outputLogger";

export const SUPABASE_URL = "https://zxntvdrqokmgkbgydmzr.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4bnR2ZHJxb2ttZ2tiZ3lkbXpyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ1NDMxMTIsImV4cCI6MjEwMDExOTExMn0.EBE7SlvO3sv9HBxDdk9IMf80aDWPxU9MmkBJEqhBSLA";

const REFRESH_TOKEN_KEY = "aurix.refreshToken";
const ACCESS_TOKEN_KEY = "aurix.accessToken";
const EMAIL_KEY = "aurix.email";

export class AuthManager {
  private supabase: SupabaseClient;

  constructor(private secrets: vscode.SecretStorage) {
    this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false, // Node/VS Code environment handles storage via SecretStorage
        autoRefreshToken: false,
      },
    });
  }

  /**
   * Called on extension activation to automatically restore session using refresh_token.
   */
  async initSession(): Promise<boolean> {
    const refreshToken = await this.secrets.get(REFRESH_TOKEN_KEY);
    if (!refreshToken) {
      logger.info("No saved refresh token found in SecretStorage.");
      return false;
    }

    try {
      logger.info("Restoring Supabase session from SecretStorage...");
      const { data, error } = await this.supabase.auth.refreshSession({ refresh_token: refreshToken });

      if (error || !data.session) {
        logger.warn(`Session restoration failed: ${error?.message ?? "no session returned"}`);
        await this.clearTokens();
        return false;
      }

      await this.saveSession(data.session.access_token, data.session.refresh_token, data.session.user?.email);
      logger.info(`Session successfully restored for ${data.session.user?.email ?? "user"}`);
      return true;
    } catch (err: any) {
      logger.error(`Error during session restoration: ${err.message ?? err}`);
      return false;
    }
  }

  /**
   * Login or Sign Up via Supabase Auth.
   */
  async login(): Promise<boolean> {
    const action = await vscode.window.showQuickPick(
      [
        { label: "Sign In", description: "Sign in with existing AURIX account" },
        { label: "Sign Up", description: "Create a new AURIX account" },
      ],
      { placeHolder: "Select AURIX Authentication Mode" }
    );

    if (!action) return false;

    if (action.label === "Sign Up") {
      return this.signUp();
    }

    const email = await vscode.window.showInputBox({
      prompt: "AURIX Email",
      ignoreFocusOut: true,
      validateInput: (v) => (!v.includes("@") ? "Enter a valid email address" : undefined),
    });
    if (!email) return false;

    const password = await vscode.window.showInputBox({
      prompt: "AURIX Password",
      password: true,
      ignoreFocusOut: true,
    });
    if (!password) return false;

    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error || !data.session) {
        logger.error(`Supabase login failed: ${error?.message ?? "unknown error"}`);
        vscode.window.showErrorMessage(`AURIX Login Failed: ${error?.message ?? "Invalid credentials"}`);
        return false;
      }

      await this.saveSession(data.session.access_token, data.session.refresh_token, data.session.user?.email ?? email);
      logger.info(`Login successful for ${data.session.user?.email}`);
      vscode.window.showInformationMessage(`AURIX: Logged in successfully as ${data.session.user?.email}! 🛡️`);
      return true;
    } catch (err: any) {
      logger.error(`Login exception: ${err.message ?? err}`);
      vscode.window.showErrorMessage(`AURIX Login Error: ${err.message ?? err}`);
      return false;
    }
  }

  /**
   * Create a new account with Supabase Auth.
   */
  async signUp(): Promise<boolean> {
    const email = await vscode.window.showInputBox({
      prompt: "Enter Email for New AURIX Account",
      ignoreFocusOut: true,
      validateInput: (v) => (!v.includes("@") ? "Enter a valid email address" : undefined),
    });
    if (!email) return false;

    const password = await vscode.window.showInputBox({
      prompt: "Enter Password for New AURIX Account (min 6 chars)",
      password: true,
      ignoreFocusOut: true,
      validateInput: (v) => (v.length < 6 ? "Password must be at least 6 characters" : undefined),
    });
    if (!password) return false;

    try {
      const { data, error } = await this.supabase.auth.signUp({
        email: email.trim(),
        password,
      });

      if (error) {
        logger.error(`Supabase Sign Up failed: ${error.message}`);
        vscode.window.showErrorMessage(`AURIX Sign Up Failed: ${error.message}`);
        return false;
      }

      if (data.session) {
        await this.saveSession(data.session.access_token, data.session.refresh_token, data.session.user?.email ?? email);
        vscode.window.showInformationMessage(`AURIX Account Created! Logged in as ${email}. 🎉`);
        return true;
      } else {
        vscode.window.showInformationMessage(`AURIX Account Created! Check your email (${email}) to confirm your registration.`);
        return true;
      }
    } catch (err: any) {
      logger.error(`Sign Up exception: ${err.message ?? err}`);
      vscode.window.showErrorMessage(`AURIX Sign Up Error: ${err.message ?? err}`);
      return false;
    }
  }

  async logout(): Promise<void> {
    try {
      await this.supabase.auth.signOut();
    } catch (err: any) {
      logger.warn(`Supabase signOut error: ${err.message ?? err}`);
    }
    await this.clearTokens();
    logger.info("User signed out and tokens cleared from SecretStorage.");
    vscode.window.showInformationMessage("AURIX: Logged out successfully.");
  }

  /**
   * Returns a valid JWT access token. Automatically refreshes using refresh_token if necessary.
   */
  async getToken(): Promise<string | undefined> {
    let accessToken = await this.secrets.get(ACCESS_TOKEN_KEY);
    const refreshToken = await this.secrets.get(REFRESH_TOKEN_KEY);

    if (!refreshToken) {
      return undefined;
    }

    // Attempt token refresh to guarantee valid token before API calls
    try {
      const { data, error } = await this.supabase.auth.refreshSession({ refresh_token: refreshToken });
      if (!error && data.session) {
        await this.saveSession(data.session.access_token, data.session.refresh_token, data.session.user?.email);
        return data.session.access_token;
      }
    } catch {
      // Fall back to stored accessToken if refresh fails temporarily
    }

    return accessToken;
  }

  async getEmail(): Promise<string | undefined> {
    return this.secrets.get(EMAIL_KEY);
  }

  async requireToken(): Promise<string | undefined> {
    const token = await this.getToken();
    if (!token) {
      const action = await vscode.window.showWarningMessage(
        "AURIX: You must be logged in to execute scans.",
        "Sign In / Sign Up"
      );
      if (action === "Sign In / Sign Up") {
        await this.login();
        return this.getToken();
      }
      return undefined;
    }
    return token;
  }

  private async saveSession(accessToken: string, refreshToken: string, email?: string): Promise<void> {
    await this.secrets.store(ACCESS_TOKEN_KEY, accessToken);
    await this.secrets.store(REFRESH_TOKEN_KEY, refreshToken);
    if (email) {
      await this.secrets.store(EMAIL_KEY, email);
    }
  }

  private async clearTokens(): Promise<void> {
    await this.secrets.delete(ACCESS_TOKEN_KEY);
    await this.secrets.delete(REFRESH_TOKEN_KEY);
    await this.secrets.delete(EMAIL_KEY);
  }
}
