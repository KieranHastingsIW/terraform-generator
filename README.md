# Firebase Studio

This is a NextJS starter in Firebase Studio.

To get started, take a look at src/app/page.tsx.

TODO: in acl exception resource and queue subscription resource, use the refrencing name for querue and acl profile values ratehr than queue name and acl name 

i.e 
Do not use the following 
resource "solacebroker_msg_vpn_acl_profile_publish_topic_exception" "demo_generator_acl_publish_exception_1" {
######  acl_profile_name                = "DEMO_GENERATOR_ACL" #######
  msg_vpn_name                    = solacebroker_msg_vpn.NEMS_01.msg_vpn_name
  publish_topic_exception         = "DEMO_GENERATOR_AUTH/topic/*/\u003e"
  publish_topic_exception_syntax  = "smf"

}

instead use 

resource "solacebroker_msg_vpn_acl_profile_publish_topic_exception" "demo_generator_acl_publish_exception_1" {
  acl_profile_name                = solacebroker_msg_vpn_acl_profile.demo_generator_acl.acl_profile_name
  msg_vpn_name                    = solacebroker_msg_vpn.NEMS_01.msg_vpn_name
  publish_topic_exception         = "DEMO_GENERATOR_AUTH/topic/*/\u003e"
  publish_topic_exception_syntax  = "smf"
  depends_on = [
    solacebroker_msg_vpn_acl_profile.demo_generator_acl
  ] 
}