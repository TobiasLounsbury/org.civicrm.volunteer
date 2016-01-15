<?php

/**
 * This file is used to collect util API functions not related to any particular
 * CiviCRM entity. Since so much of the interface has moved to the client side,
 * we need server-side code to handle things like managing dependencies.
 *
 * @package CiviVolunteer_APIv3
 * @subpackage API_Volunteer_Project
 */

/**
 * This function will return the needed pieces to load up the backbone/
 * marionette project backend from within an angular page.
 *
 * @param array $params
 *   Not presently used.
 * @return array
 *   Keyed with "css," "templates," "scripts," and "settings," this array
 *   contains the dependencies of the backbone-based volunteer app.
 *
 */
function civicrm_api3_volunteer_util_loadbackbone($params) {

  $results = array("css" => array(), "templates" => array(), "scripts" => array(), "settings" => array());

  $ccr = CRM_Core_Resources::singleton();
  $config = CRM_Core_Config::singleton();

  $results['css'][] = $ccr->getUrl('org.civicrm.volunteer', 'css/volunteer_app.css');

  $baseDir = CRM_Extension_System::singleton()->getMapper()->keyToBasePath('org.civicrm.volunteer') . '/';
  // This glob pattern will recurse the js directory up to 4 levels deep
  foreach (glob($baseDir . 'js/backbone/{*,*/*,*/*/*,*/*/*/*}.js', GLOB_BRACE) as $file) {
    $fileName = substr($file, strlen($baseDir));
    $results['scripts'][] = $ccr->getUrl('org.civicrm.volunteer', $fileName);
  }

  $results['templates'][] = 'civicrm/volunteer/backbonetemplates';

  $results['settings'] = array(
    'pseudoConstant' => array(
      'volunteer_need_visibility' => array_flip(CRM_Volunteer_BAO_Need::buildOptions('visibility_id', 'validate')),
      'volunteer_role' => CRM_Volunteer_BAO_Need::buildOptions('role_id', 'get'),
      'volunteer_status' => CRM_Activity_BAO_Activity::buildOptions('status_id', 'validate'),
    ),
    // TODO: This API is about satisfying generic depenedencies need to build
    // the backbone-based volunteer UIs inside an Angular app. Previously
    // CRM.volunteer.default_date provided the start time of the event as a
    // default for new needs; project-specific information does not belong in
    // this API so we'll temporarily set this for noon of the next day until
    // we have an alternative mechanism.
    'volunteer' => array(
      //'default_date' => CRM_Utils_Array::value('start_date', $entity),
      'default_date' => date("Y-m-d H:i:s", strtotime('tomorrow noon')),
    ),
    'config' => array(
      'timeInputFormat' => $config->timeInputFormat,
    ),
    'constants' => array(
      'CRM_Core_Action' => array(
        'NONE' => 0,
        'ADD' => 1,
        'UPDATE' => 2,
        'VIEW' => 4,
        'DELETE' => 8,
        'BROWSE' => 16,
        'ENABLE' => 32,
        'DISABLE' => 64,
        'EXPORT' => 128,
        'BASIC' => 256,
        'ADVANCED' => 512,
        'PREVIEW' => 1024,
        'FOLLOWUP' => 2048,
        'MAP' => 4096,
        'PROFILE' => 8192,
        'COPY' => 16384,
        'RENEW' => 32768,
        'DETACH' => 65536,
        'REVERT' => 131072,
        'CLOSE' => 262144,
        'REOPEN' => 524288,
        'MAX_ACTION' => 1048575,
      ),
    ),
  );

  return civicrm_api3_create_success($results, "VolunteerUtil", "loadbackbone", $params);
}

/**
 * This function returns the permissions defined by the volunteer extension.
 *
 * @param array $params
 *   Not presently used.
 * @return array
 */
function civicrm_api3_volunteer_util_getperms($params) {
  $results = array();

  foreach (CRM_Volunteer_Permission::getVolunteerPermissions() as $k => $v) {
    $results[] = array(
      'description' => $v[1],
      'label' => $v[0],
      'name' => $k,
      'safe_name' => strtolower(str_replace(array(' ', '-'), '_', $k)),
    );
  }

  return civicrm_api3_create_success($results, "VolunteerUtil", "getperms", $params);
}

function _civicrm_api3_volunteer_util_getsupportingdata_spec(&$params) {
  $params['controller'] = array(
    'title' => 'Controller',
    'description' => 'For which Angular controller is supporting data required?',
    'type' => CRM_Utils_Type::T_STRING,
    'api.required' => 1,
  );
}

/**
 * This function returns supporting data for various JavaScript-driven interfaces.
 *
 * The purpose of this API is to provide limited access to general-use APIs to
 * facilitate building user interfaces without having to grant users access to
 * APIs they otherwise shouldn't be able to access.
 *
 * @param array $params
 *   @see _civicrm_api3_volunteer_util_getsupportingdata_spec()
 * @return array
 */
function civicrm_api3_volunteer_util_getsupportingdata($params) {
  $results = array();

  $controller = CRM_Utils_Array::value('controller', $params);
  if ($controller === 'VolunteerProject') {
    $relTypes = civicrm_api3('OptionValue', 'get', array(
      'option_group_id' => CRM_Volunteer_BAO_ProjectContact::RELATIONSHIP_OPTION_GROUP,
    ));
    $results['relationship_types'] = $relTypes['values'];

    $results['phone_types'] = CRM_Core_OptionGroup::values("phone_type", FALSE, FALSE, TRUE);

    $results['defaults'] = array(
      'profile' => civicrm_api3('UFGroup', 'getvalue', array(
        "name" => "volunteer_sign_up",
        "return" => "id"
      )),
      'relationships' => _volunteerGetProjectRelationshipDefaults(),
    );
  }

  if ($controller === 'VolOppsCtrl') {
    $results['roles'] = CRM_Core_OptionGroup::values('volunteer_role', FALSE, FALSE, TRUE);
  }

  $results['use_profile_editor'] = CRM_Volunteer_Permission::check(array("access CiviCRM","profile listings and forms"));

  if (!$results['use_profile_editor']) {
    $profiles = civicrm_api3('UFGroup', 'get', array("return" => "title", "sequential" => 1, 'options' => array('limit' => 0)));
    $results['profile_list'] = $profiles['values'];
  }


  return civicrm_api3_create_success($results, "VolunteerUtil", "getsupportingdata", $params);
}

/**
 * Helper function to get the default project relationships for a new project.
 *
 * @return array
 */
function _volunteerGetProjectRelationshipDefaults() {
  $defaults = array();

  $relTypes = CRM_Core_OptionGroup::values("volunteer_project_relationship", true, FALSE, FALSE, NULL, 'name');
  $ownerType = $relTypes['volunteer_owner'];
  $managerType = $relTypes['volunteer_manager'];
  $beneficiaryType = $relTypes['volunteer_beneficiary'];

  $contactId = CRM_Core_Session::getLoggedInContactID();

  $defaults[$ownerType] = array($contactId);
  $defaults[$managerType] = array($contactId);

  $employerRelationshipTypeId = civicrm_api3('RelationshipType', 'getvalue', array(
    'return' => "id",
    'name_b_a' => "Employer of",
  ));

  try {
    $result = civicrm_api3('Relationship', 'getvalue', array(
      'return' => "contact_id_b",
      'contact_id_a' => $contactId,
      'relationship_type_id' => $employerRelationshipTypeId,
      'is_active' => 1,
    ));
    $defaultBeneficiary = array($result);
  } catch(Exception $e) {
    $domain = civicrm_api3('Domain', 'getsingle', array('current_domain' => 1));
    $defaultBeneficiary = array($domain['contact_id']);
  }
  $defaults[$beneficiaryType] = $defaultBeneficiary;

  return $defaults;
}

/**
 * This method returns a list of active campaigns
 *
 * @param array $params
 *   Not presently used.
 * @return array
 */
function civicrm_api3_volunteer_util_getcampaigns($params) {
  return civicrm_api3('Campaign', 'get', array(
    "return" => "title,id",
    "is_active" => 1
  ));
}

/**
 * This function returns the enabled countries in CiviCRM.
 *
 * @param array $params
 *   Not presently used.
 * @return array
 */
function civicrm_api3_volunteer_util_getcountries($params) {
  $settings = civicrm_api3('Setting', 'get', array(
    "return" => array("countryLimit", "defaultContactCountry"),
    "sequential" => 1,
  ));

  $countries = civicrm_api3('Country', 'get', array(
    "id" => array(
      "IN" => $settings['values'][0]['countryLimit'],
    ),
  ));

  $results = $countries['values'];
  foreach ($results as $k => $country) {
    // since we are wrapping CiviCRM's API, and it provides even boolean data
    // as quoted strings, we'll do the same
    $results[$k]['is_default'] = ($country['id'] === $settings['values'][0]['defaultContactCountry']) ? "1" : "0";
  }

  return civicrm_api3_create_success($results, "VolunteerUtil", "getcountries", $params);
}

/**
 * This function returns the active, searchable custom fields in the
 * Volunteer_Information custom field group.
 *
 * @param array $params
 *   Not presently used.
 * @return array
 */
function civicrm_api3_volunteer_util_getcustomfields($params) {
  $allowedCustomFieldTypes = array('AdvMulti-Select', 'Autocomplete-Select',
    'CheckBox', 'Multi-Select', 'Radio', 'Select', 'Text');

  $customGroupAPI = civicrm_api3('CustomGroup', 'getsingle', array(
    'extends' => 'Individual',
    'name' => 'Volunteer_Information',
    'api.customField.get' => array(
      'html_type' => array('IN' => $allowedCustomFieldTypes),
      'is_active' => 1,
      'is_searchable' => 1
    ),
    'options' => array('limit' => 0),
  ));
  $customFields = $customGroupAPI['api.customField.get']['values'];

  // get options for select lists
  $optionListIDs = array();
  foreach ($customFields as $field) {
    if (!empty($field['option_group_id'])) {
      $optionListIDs[] = $field['option_group_id'];
    }
  }

  $optionValueAPI = civicrm_api3('OptionValue', 'get', array(
    'is_active' => 1,
    'opt_group_id' => array('IN' => array_unique($optionListIDs)),
    'options' => array(
      'limit' => 0,
      'sort' => 'weight',
    )
  ));

  $optionData = array();
  foreach ($optionValueAPI['values'] as $opt) {
    $key = $opt['option_group_id'];
    if (!array_key_exists($key, $optionData)) {
      $optionData[$key] = array();
    }
    $optionData[$key][] = $opt;
  }

  foreach($customFields as &$cField) {
    $optionGroupId = CRM_Utils_Array::value('option_group_id', $cField);
    if ($optionGroupId) {
      $cField['options'] = $optionData[$optionGroupId];

    // Boolean fields don't use option groups, so we supply one
    } elseif ($cField['data_type'] === 'Boolean' && $cField['html_type'] === 'Radio') {
      $cField['options'] = array(
        array (
          'is_active' => 1,
          'is_default' => 1,
          'label' => ts("Yes", array('domain' => 'org.civicrm.volunteer')),
          'value' => 1,
          'weight' => 1,
        ),
        array (
          'is_active' => 1,
          'is_default' => 0,
          'label' => ts("No", array('domain' => 'org.civicrm.volunteer')),
          'value' => 0,
          'weight' => 2,
        ),
      );
    }
  }

  return civicrm_api3_create_success($customFields, "VolunteerUtil", "getcountries", $params);
}
