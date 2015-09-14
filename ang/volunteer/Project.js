(function(angular, $, _) {

  angular.module('volunteer').config(function($routeProvider) {
      $routeProvider.when('/volunteer/manage/:projectId', {
        controller: 'VolunteerProject',
        templateUrl: '~/volunteer/Project.html',
        resolve: {
          project: function(crmApi, $route) {
            return crmApi('VolunteerProject', 'getsingle', {
              id: $route.current.params.projectId
            });
          },
          relationship_types: function(crmApi) {
            return crmApi('OptionValue', 'get', {
              "sequential": 1,
              "option_group_id": "volunteer_project_relationship"
            });
          },
          relationship_data: function(crmApi, $route) {
            return crmApi('VolunteerProjectContact', 'get', {
              "sequential": 1,
              "project_id": $route.current.params.projectId
            });
          },
          profiles: function(crmApi, $route) {
            return crmApi('UFJoin', 'get', {
              "sequential": 1,
              "module": "CiviVolunteer",
              "entity_id": $route.current.params.projectId
            });
          },
          is_entity: function() { return false; },
          profile_status: function(crmProfiles) {
            return crmProfiles.load();
          }
        }
      }).when('/volunteer/manage/:entityTable/:entityId', {
        controller: 'VolunteerProject',
        templateUrl: '~/volunteer/Project.html',
        resolve: {
          project: function(crmApi, $route) {
            return crmApi('VolunteerProject', 'getsingle', {
              entity_table: $route.current.params.entityId,
              entity_id: $route.current.params.entityTable
            });
          },
          is_entity: function() { return true; },
          profile_status: function(crmProfiles) {
            return crmProfiles.load();
          }
        }
      });
    }
  );

  // The controller uses *injection*. This default injects a few things:
  //   $scope -- This is the set of variables shared between JS and HTML.
  //   crmApi, crmStatus, crmUiHelp -- These are services provided by civicrm-core.
  angular.module('volunteer').controller('VolunteerProject', function($scope, $location, crmApi, crmStatus, crmUiAlert, crmUiHelp, crmProfiles, project, is_entity, profile_status, relationship_types, relationship_data, profiles) {
    // The ts() and hs() functions help load strings for this module.
    var ts = $scope.ts = CRM.ts('org.civicrm.volunteer');
    var hs = $scope.hs = crmUiHelp({file: 'CRM/Volunteer/Form/Volunteer'}); // See: templates/CRM/volunteer/Project.hlp
    project.profileCount = 0;


    var relationships = {};
    var relationship_remove_list = {};
    $(relationship_data.values).each(function(index, relationship) {
      if (!relationships.hasOwnProperty(relationship.relationship_type_id)) {
        relationships[relationship.relationship_type_id] = [];
      }
      if (!relationship_remove_list.hasOwnProperty(relationship.relationship_type_id)) {
        relationship_remove_list[relationship.relationship_type_id] = {};
      }
      relationship_remove_list[relationship.relationship_type_id][relationship.contact_id] = relationship.id;
      relationships[relationship.relationship_type_id].push(relationship.contact_id);
    });

    var profileIds = {};
    $(profiles.values).each(function(index, profile) {
      profileIds[profile.id] = true;
    });
    $scope.profiles = profiles.values;
    $scope.relationships = relationships;
    $scope.relationship_types = relationship_types.values;
    $scope.profile_status = profile_status;
    $scope.is_entity = is_entity;
    project.is_active = (project.is_active === "1");
    $scope.project = project;

    $scope.addProfile = function() {
      $scope.profiles.push({"is_active": "1", "module": "CiviVolunteer", "weight": 1});
    };

    //Make sure there is always a minimum of one profile selector
    if ($scope.profiles.length === 0) {
      $scope.addProfile();
    }

    $scope.removeProfile = function(index) {
      $scope.profiles.splice(index, 1);
    };
    $scope.validateProject = function() {
      var valid = true;


      //Do some validation here...

      return valid;
    };

    $scope.saveProject = function() {
      if ($scope.validateProject()) {
        crmApi('VolunteerProject', 'create', $scope.project).then(function(result) {
          var projectId = result.id;


          //save the relationships
          $.each($scope.relationships, function(rType, rData) {
            if(typeof(rData) === "string") {
              rData = rData.split(",");
            }
            $.each(rData, function (index, contactId) {
              if(contactId) {
                if (relationship_remove_list.hasOwnProperty(rType)) {
                  relationship_remove_list[rType][contactId] = false;
                }
                crmApi("VolunteerProjectContact", "create", {project_id: projectId, relationship_type_id: rType, contact_id: contactId});
              }
            });
          });

          //Remove the extraneous relationships
          $.each(relationship_remove_list, function(rType, rData) {
            $.each(rData, function (index, id) {
              if(id) {
                crmApi("VolunteerProjectContact", "delete", {"id": id});
              }
            });
          });


          //save the profiles
          $($scope.profiles).each(function(index, profile) {
            profile.entity_id = projectId;
            if(profile.hasOwnProperty("id")) {
              delete profileIds[profile.id];
            }
            crmApi("UFJoin", "create", profile);
          });

          //remove profiles no longer needed
          $.each(profileIds, function(profileId) {
            console.log("removing profile", profileId);
            //todo: This is not implemented, so we need to shim it
            //crmApi("UFJoin", "delete", {id: profileId});
          });
        });

        //Let the user know we are saving
        crmUiAlert({text: ts('Changes saved successfully'), title: ts('Saved'), type: 'success'});
        //Forward to someplace else
        $location.path( "/volunteer/manage" );
      } else {
        return false;
      }
    }
  });

})(angular, CRM.$, CRM._);
