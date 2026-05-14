import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  ConfigurationServiceClientCredentialFactory,
  type ConfigurationBotFrameworkAuthenticationOptions,
} from "botbuilder";
import { publicOnlyMiddleware } from "./middleware/public-only.js";
import { mentionRequiredMiddleware } from "./middleware/mention-required.js";

export function createAdapter(env: {
  appId: string;
  appPassword: string;
  appTenantId: string | undefined;
}): CloudAdapter {
  const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
    MicrosoftAppId: env.appId,
    MicrosoftAppPassword: env.appPassword,
    MicrosoftAppType: "MultiTenant",
    MicrosoftAppTenantId: env.appTenantId ?? "",
  });
  const authConfig: ConfigurationBotFrameworkAuthenticationOptions = {};
  const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication(authConfig, credentialsFactory);
  const adapter = new CloudAdapter(botFrameworkAuthentication);
  adapter.use(publicOnlyMiddleware);
  adapter.use(mentionRequiredMiddleware);
  adapter.onTurnError = async (context, error) => {
    process.stderr.write(`[bot error] ${error?.message ?? String(error)}\n`);
    if (context.activity.type === "message") {
      try {
        await context.sendActivity({ type: "message", text: `Error: ${error?.message ?? String(error)}` });
      } catch {
        // swallow
      }
    }
  };
  return adapter;
}
