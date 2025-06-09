
'use server';
/**
 * @fileOverview Generates Terraform configuration for Solace resources.
 *
 * - generateTerraform - A function that handles the Terraform code generation.
 * - TerraformGenerationInput - The input type for the generateTerraform function (matches ProfileConfiguratorValues).
 * - TerraformGenerationOutput - The return type for the generateTerraform function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { profileConfiguratorSchema, type ProfileConfiguratorValues } from '@/lib/profile-configurator-schema';

export type TerraformGenerationInput = ProfileConfiguratorValues;

const TerraformGenerationOutputSchema = z.object({
  aclProfileResource: z.string(),
  authGroupResource: z.string(),
  topicExceptionResources: z.array(z.string()), // Can be publish or subscribe
  queueResource: z.string().optional(),
  queueSubscriptionResources: z.array(z.string()).optional(),
  fullTerraformConfig: z.string(),
});
export type TerraformGenerationOutput = z.infer<typeof TerraformGenerationOutputSchema>;

/**
 * Sanitizes a string for use as a Terraform resource name.
 * Converts to lowercase, replaces non-alphanumeric characters (excluding underscore) with underscores,
 * and removes leading/trailing underscores.
 * @param name The string to sanitize.
 * @returns The sanitized string.
 */
function sanitizeForTerraformResourceName(name: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Converts a topic string by Unicode-escaping non-alphanumeric characters, excluding slashes and asterisks.
 * ASCII letters, digits, slashes (/), and asterisks (*) are kept as is. Other characters are converted to \uXXXX.
 * @param topicValue The topic string.
 * @returns The Unicode-escaped topic string.
 */
function convertTopicToUnicodeEscaped(topicValue: string): string {
  let result = '';
  for (const char of topicValue) {
    if (/[a-zA-Z0-9/*]/.test(char)) { // Keep alphanumeric, slashes, and asterisks
      result += char;
    } else {
      const unicodeHex = char.charCodeAt(0).toString(16).padStart(4, '0');
      result += `\\u${unicodeHex}`;
    }
  }
  return result;
}

export async function generateTerraform(input: TerraformGenerationInput): Promise<TerraformGenerationOutput> {
  return generateTerraformFlow(input);
}

const generateTerraformFlow = ai.defineFlow(
  {
    name: 'generateTerraformFlow',
    inputSchema: profileConfiguratorSchema,
    outputSchema: TerraformGenerationOutputSchema,
  },
  async (input: TerraformGenerationInput) => {
    const sanitizedAclProfileName = sanitizeForTerraformResourceName(input.aclProfileName);
    const sanitizedAuthProfileName = sanitizeForTerraformResourceName(input.authProfileName);
    const sanitizedQueueName = input.queueName ? sanitizeForTerraformResourceName(input.queueName) : undefined;
    const msgVpnNameValue = "solacebroker_msg_vpn.NEMS_01.msg_vpn_name";

    const aclProfileResource = `
resource "solacebroker_msg_vpn_acl_profile" "${sanitizedAclProfileName}" {
  acl_profile_name                     = "${input.aclProfileName}"
  client_connect_default_action        = "allow"
  msg_vpn_name                         = ${msgVpnNameValue}
  subscribe_share_name_default_action  = "disallow"
}`.trim();

    const clientProfileNameValue = input.applicationType === "publisher"
      ? "solacebroker_msg_vpn_client_profile.NEMS_01_publisher-client-profile.client_profile_name"
      : "solacebroker_msg_vpn_client_profile.NEMS_01_subscriber-client-profile.client_profile_name";

    const authGroupResource = `
resource "solacebroker_msg_vpn_authorization_group" "${sanitizedAuthProfileName}" {
  acl_profile_name          = solacebroker_msg_vpn_acl_profile.${sanitizedAclProfileName}.acl_profile_name
  authorization_group_name  = "${input.authProfileName}"
  client_profile_name       = ${clientProfileNameValue}
  enabled                   = true
  msg_vpn_name              = ${msgVpnNameValue}
}`.trim();

    const topicExceptionResources: string[] = [];
    if (input.applicationType === "publisher") {
      input.topics.forEach((topic, index) => {
        const convertedTopicValue = convertTopicToUnicodeEscaped(topic.value);
        const resourceName = `${sanitizedAclProfileName}_publish_exception_${index}`;
        const exceptionResource = `
resource "solacebroker_msg_vpn_acl_profile_publish_topic_exception" "${resourceName}" {
  acl_profile_name                = "${input.aclProfileName}"
  msg_vpn_name                    = ${msgVpnNameValue}
  publish_topic_exception         = "${convertedTopicValue}"
  publish_topic_exception_syntax  = "smf"
}`.trim();
        topicExceptionResources.push(exceptionResource);
      });
    } else if (input.applicationType === "subscriber") {
      input.topics.forEach((topic, index) => {
        const convertedTopicValue = convertTopicToUnicodeEscaped(topic.value);
        const resourceName = `${sanitizedAclProfileName}_subscribe_exception_${index}`;
        const exceptionResource = `
resource "solacebroker_msg_vpn_acl_profile_subscribe_topic_exception" "${resourceName}" {
  acl_profile_name                  = "${input.aclProfileName}"
  msg_vpn_name                      = ${msgVpnNameValue}
  subscribe_topic_exception         = "${convertedTopicValue}"
  subscribe_topic_exception_syntax  = "smf"
}`.trim();
        topicExceptionResources.push(exceptionResource);
      });
    }

    let queueResource: string | undefined = undefined;
    const queueSubscriptionResources: string[] = [];

    if (input.applicationType === "subscriber" && input.queueName && sanitizedQueueName && input.ownerId) {
      queueResource = `
resource "solacebroker_msg_vpn_queue" "${sanitizedQueueName}" {
  egress_enabled                                 = true
  event_bind_count_threshold                     = { clear_percent = 60, set_percent = 80 }
  event_msg_spool_usage_threshold                = { clear_percent = 18, set_percent = 25 }
  event_reject_low_priority_msg_limit_threshold  = { clear_percent = 60, set_percent = 80 }
  ingress_enabled                                = true
  max_msg_size                                   = 1000000
  max_msg_spool_usage                            = 500
  msg_vpn_name                                   = ${msgVpnNameValue}
  owner                                          = "${input.ownerId}"
  queue_name                                     = "${input.queueName}"
}`.trim();

      input.topics.forEach((topic, index) => {
        const convertedTopicValue = convertTopicToUnicodeEscaped(topic.value);
        const resourceName = `${sanitizedQueueName}_subscription_${index}`;
        const subscriptionResource = `
resource "solacebroker_msg_vpn_queue_subscription" "${resourceName}" {
  msg_vpn_name        = ${msgVpnNameValue}
  queue_name          = "${input.queueName}"
  subscription_topic  = "${convertedTopicValue}"
}`.trim();
        queueSubscriptionResources.push(subscriptionResource);
      });
    }

    const allResources = [
      aclProfileResource,
      authGroupResource,
      ...topicExceptionResources
    ];
    if (queueResource) {
      allResources.push(queueResource);
    }
    if (queueSubscriptionResources.length > 0) {
      allResources.push(...queueSubscriptionResources);
    }

    const fullTerraformConfig = allResources.join('\n\n');

    return {
      aclProfileResource,
      authGroupResource,
      topicExceptionResources,
      queueResource,
      queueSubscriptionResources: queueSubscriptionResources.length > 0 ? queueSubscriptionResources : undefined,
      fullTerraformConfig,
    };
  }
);
