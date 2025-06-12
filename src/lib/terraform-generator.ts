
import type { ProfileConfiguratorValues } from './profile-configurator-schema';

export type TerraformGenerationOutput = {
  aclProfileResource: string;
  authGroupResource: string;
  topicExceptionResources: string[];
  queueResource?: string;
  queueSubscriptionResources?: string[];
  fullTerraformConfig: string;
};

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
 * Converts only the ">" character in a topic string to its Unicode escape sequence "\\u003e".
 * All other characters are preserved as is.
 * @param topicValue The topic string.
 * @returns The topic string with ">" converted.
 */
function convertTopicToUnicodeEscaped(topicValue: string): string {
  let result = '';
  for (const char of topicValue) {
    if (char === '>') {
      result += '\\u003e';
    } else {
      result += char;
    }
  }
  return result;
}

export function generateTerraformConfig(input: ProfileConfiguratorValues): TerraformGenerationOutput {
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
  acl_profile_name                = solacebroker_msg_vpn_acl_profile.${sanitizedAclProfileName}.acl_profile_name
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
  acl_profile_name                  = solacebroker_msg_vpn_acl_profile.${sanitizedAclProfileName}.acl_profile_name
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
  max_msg_size                                   = 1e+06
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
  queue_name          = solacebroker_msg_vpn_queue.${sanitizedQueueName}.queue_name
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
