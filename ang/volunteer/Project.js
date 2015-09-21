(function(angular, $, _) {

  angular.module('volunteer').config(function($routeProvider) {
      $routeProvider.when('/volunteer/manage/:projectId', {
        controller: 'VolunteerProject',
        templateUrl: '~/volunteer/Project.html',
        resolve: {
          project: function(crmApi, $route) {
            if ($route.current.params.projectId == 0) {
              return {};
            } else {
              return crmApi('VolunteerProject', 'getsingle', {
                id: $route.current.params.projectId
              });
            }
          },
          relationship_types: function(crmApi) {
            return crmApi('OptionValue', 'get', {
              "sequential": 1,
              "option_group_id": "volunteer_project_relationship"
            });
          },
          phone_types: function(crmApi) {
            return crmApi('OptionValue', 'get', {
              "sequential": 1,
              "option_group_id": "phone_type",
              "return": "value,label"
            });
          },
          relationship_data: function(crmApi, $route) {
            if ($route.current.params.projectId == 0) {
              return {"values": []};
            } else {
              return crmApi('VolunteerProjectContact', 'get', {
                "sequential": 1,
                "project_id": $route.current.params.projectId
              });
            }
          },
          location_blocks: function(crmApi) {
            return crmApi('VolunteerProject', 'locations', {});
          },
          profiles: function(crmApi, $route) {
            if ($route.current.params.projectId == 0) {
              return {"values": []};
            } else {
              return crmApi('UFJoin', 'get', {
                "sequential": 1,
                "module": "CiviVolunteer",
                "entity_id": $route.current.params.projectId
              });
            }
          },
          is_entity: function() { return false; },
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
  angular.module('volunteer').controller('VolunteerProject', function($scope, $location, $q, crmApi, crmStatus, crmUiAlert, crmUiHelp, crmProfiles, project, is_entity, profile_status, relationship_types, relationship_data, profiles, location_blocks, phone_types) {
    // The ts() and hs() functions help load strings for this module.
    var ts = $scope.ts = CRM.ts('org.civicrm.volunteer');
    var hs = $scope.hs = crmUiHelp({file: 'CRM/Volunteer/Form/Volunteer'}); // See: templates/CRM/volunteer/Project.hlp

    var relationships = {};
    $(relationship_data.values).each(function(index, relationship) {
      if (!relationships.hasOwnProperty(relationship.relationship_type_id)) {
        relationships[relationship.relationship_type_id] = [];
      }
      relationships[relationship.relationship_type_id].push(relationship.contact_id);
    });

    var originalRelationships = _.clone(relationships);

    $scope.locationBlocks = location_blocks.values;
    $scope.locationBlocks[0] = "Create a new Location";
    $scope.locBlock = {};
    $scope.profiles = profiles.values;
    $scope.relationships = relationships;
    $scope.relationship_types = relationship_types.values;
    $scope.phone_types = phone_types.values;
    $scope.profile_status = profile_status;
    $scope.is_entity = is_entity;
    project.is_active = (project.is_active === "1");
    $scope.project = project;


    $scope.refreshLocBlock = function() {
      if (!!$scope.project.loc_block_id) {
        $.ajax({
          url: CRM.url('civicrm/ajax/locBlock', 'reset=1'),
          data: {'lbid': $scope.project.loc_block_id},
          dataType: 'json',
          success: function (data) {
            var locBlockData = {};
            $.each(data, function (index, item) {
              if (index === "count_loc_used") {
                locBlockData.count_loc_used = item;
              } else {
                var objName = index.split("_").slice(0, 2).join("_");
                var propName = index.split("_").slice(2).join("_");
                if (!locBlockData.hasOwnProperty(objName)) {
                  locBlockData[objName] = {};
                }
                locBlockData[objName][propName] = item;
              }
            });
            //Calling apply because otherwise the view doesn't refresh
            // until a text field is focus/blurred or changed
            $scope.locBlock = locBlockData;
            $scope.$apply();
          }
        });
      }
    };
    //Refresh as soon as we are up and running because we don't have this data yet.
    $scope.refreshLocBlock();

    $scope.locBlockChanged = function() {
      if($scope.project.loc_block_id == 0) {
        $scope.locBlock = {};
        $("#crm-vol-location-block .crm-accordion-body").slideDown({complete: function() {
          $("#crm-vol-location-block .crm-accordion-wrapper").removeClass("collapsed");
        }});
      } else {
        //Load the data from the server.
        $scope.refreshLocBlock();
      }
    };

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


      if(!$scope.project.title) {
        CRM.status(ts("Title is a required field"), "Required");
        valid = false;
      }

      //Do some validation here...

      return valid;
    };

    $scope.saveProject = function() {
      if ($scope.validateProject()) {
        crmApi('VolunteerProject', 'create', $scope.project).then(function(result) {
          var projectId = result.id;


          //save the relationships
          var rPromises = [];
          $.each($scope.relationships, function(rType, rData) {
            if(typeof(rData) === "string") {
              rData = rData.split(",");
            }
            $.each(rData, function (index, contactId) {
              if(contactId && (!originalRelationships.hasOwnProperty(rType) || originalRelationships[rType].indexOf(contactId) === -1)) {
                rPromises.push(crmApi("VolunteerProjectContact", "create", {project_id: projectId, relationship_type_id: rType, contact_id: contactId}));
              }
            });
          });

          $q.all(rPromises).then(function(x) {
            //Remove the extraneous relationships
            crmApi('VolunteerProjectContact', 'get', {
              "project_id": projectId
            }).then(function(result) {
              if (result.count > 0) {

                var rels = {};
                $.each($scope.relationships, function (rType, rTypeData) {
                  if(typeof(rTypeData) === "string") {
                    rels[rType] = rTypeData.split(",");
                  } else {
                    rels[rType] = rTypeData;
                  }
                });

                $.each(result.values, function (index, relation) {
                  if (!rels.hasOwnProperty(relation.relationship_type_id) || rels[relation.relationship_type_id].indexOf(relation.contact_id) === -1) {
                    crmApi("VolunteerProjectContact", "delete", {"id": relation.id});
                  }
                });
              }
            });
          });


          //save the profiles
          var pPromises = [];
          $($scope.profiles).each(function(index, profile) {
            profile.entity_id = projectId;
            pPromises.push(crmApi("UFJoin", "create", profile));
          });


          //remove profiles no longer needed
          $q.all(pPromises).then(function() {
            crmApi('UFJoin', 'get', {
              "sequential": 1,
              "module": "CiviVolunteer",
              "entity_id": projectId
            }).then(function(result) {
              $.each(result.values, function(index, profile) {
                var remove = true;
                $.each($scope.profiles, function(index, item) {
                  if (item.id == profile.id) {
                    remove = false;
                  }
                });

                if(remove) {
                  //todo: This is implemented in civiVol but should be added to core.
                  crmApi("VolunteerProject", "removeprofile", {id: profile.id});
                }
              });
            });
          });

        //Let the user know we are saving
        crmUiAlert({text: ts('Changes saved successfully'), title: ts('Saved'), type: 'success'});
        //Forward to someplace else
        //$location.path( "/volunteer/manage" );
        });
      } else {
        return false;
      }
    }
  });

})(angular, CRM.$, CRM._);
