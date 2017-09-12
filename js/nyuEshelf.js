// TODO:
// - Currently doesn't work when a user is logged in to Eshelf
// - Add "Guest e-Shelf"/"My e-Shelf" language to prmSearchBookmarkFilterAfter
angular.module('nyuEshelf', [])
  .config(function($httpProvider) {
    //Enable cross domain calls
    $httpProvider.defaults.useXDomain = true;
    //Enable passing of cookies for CORS calls
    $httpProvider.defaults.withCredentials = true;
    // $httpProvider.defaults.xsrfCookieName = 'X-CSRF-Token';
    // $httpProvider.defaults.xsrfHeaderName = 'X-CSRF-Token';

    //Remove the header containing XMLHttpRequest used to identify ajax call
    //that would prevent CORS from working
    delete $httpProvider.defaults.headers.common['X-Requested-With'];
  })
  .factory('nyuEshelfService', ['nyuEshelfConfig', '$http', (config, $http) => {
    return {
      csrfToken: '',
      loggedIn: false,
      checkEshelf: function(externalId) {
        var url = config.eshelfBaseUrl + "/records/from/primo.json?per=all&external_id[]=" + externalId;
        var svc = this;

        $http.get(url).then(
            function(response){
              svc.csrfToken = response.headers('x-csrf-token');
              if (response.data.length > 0) {
                if (response.data.filter(item => item["external_id"] == externalId)) {
                  svc[externalId] = true;
                  console.log("Setting X-CSRF-Token on Init")
                  console.log(svc[externalId])
                }
              }
            },
            function(response){
              svc[externalId+'_error'] = true;
            }
         );
      },
      generateRequest: function(httpMethod, data) {
        if (!/^(DELETE|POST)$/.test(httpMethod.toUpperCase())) {
          return {};
        }
        console.log("About to send the csrfToken")
        console.log(this.csrfToken)
        let headers = { 'X-CSRF-Token': this.csrfToken, 'Content-type': 'application/json;charset=utf-8' }
        let request = {
          method: httpMethod.toUpperCase(),
          url: config.eshelfBaseUrl + "/records.json",
          headers: headers,
          data: data
        }
        return request;
      },
      failure: function(response, externalId) {
        this[externalId+'_error'] = true;
      },
      success: function(response, externalId) {
        this.csrfToken = response.headers('x-csrf-token');
        console.log("Setting X-CSRF-Token on Add")
        console.log(this[externalId])

        if (response.status == 201) {
          this[externalId] = true;
        } else {
          delete this[externalId];
        }
      }
    };
  }])
  .run(['nyuEshelfService', function(nyuEshelfService){
    nyuEshelfService.checkEshelf();
  }])
  .constant('nyuEshelfConfig', {
    addToEshelf: "Add to e-Shelf",
    inEshelf: "In e-Shelf",
    inGuestEshelf: "In guest e-Shelf",
    loginToSave: "login to save permanently",
    adding: "Adding to e-Shelf...",
    deleting: "Removing from e-Shelf...",
    error: "Could not connect to e-Shelf",
    pdsUrl: {
      base: 'https://pdsdev.library.nyu.edu/pds',
      callingSystem: 'primo',
      institution: 'NYU-NUI'
    },
    eshelfBaseUrl: 'https://qa.eshelf.library.nyu.edu'
    // eshelfBaseUrl: 'http://localhost:3000'
  })
  .controller('nyuEshelfController', ['nyuEshelfService', 'nyuEshelfConfig', '$rootScope', '$scope', '$http', '$location', '$window', function(nyuEshelfService, config, $rootScope, $scope, $http, $location, $window) {
    this.$onInit = function() {
      $scope.externalId = this.prmSearchResultAvailabilityLine.result.pnx.control.recordid[0];
      $scope.elementId = "eshelf_" + $scope.externalId + ((this.prmSearchResultAvailabilityLine.isFullView) ? "_full" : "_brief");

      $scope.recordData = { "record": { "external_system": "primo", "external_id": $scope.externalId }};
      nyuEshelfService.loggedIn = !this.prmBriefResultContainer.userSessionManagerService.isGuest();
      nyuEshelfService.checkEshelf($scope.externalId);
    };

    $scope.inEshelfText = function() {
      if (nyuEshelfService.loggedIn) {
        return config.inEshelf;
      } else {
        return config.inGuestEshelf + " (<a href=\"" + $scope.pdsUrl() + "\">" + config.loginToSave + "</a>)";
      }
    };

    $scope.pdsUrl = function() {
      return config.pdsUrl.base + "?func=load-login&calling_system=" + config.pdsUrl.callingSystem + "&institute=" + config.pdsUrl.institution + "&url=http://bobcatdev.library.nyu.edu:80/primo_library/libweb/pdsLogin?targetURL=" + $window.encodeURIComponent($location.absUrl()) + "&from-new-ui=1&authenticationProfile=BASE_PROFILE";
    };

    $scope.setElementText = function() {
      if (nyuEshelfService[$scope.externalId+'_error']) { return config.error; }
      if (nyuEshelfService[$scope.externalId]) {
        return ($scope.running) ? config.deleting : $scope.inEshelfText();
      } else {
        return ($scope.running) ? config.adding : config.addToEshelf;
      }
    };

    $scope.disabled = () => (nyuEshelfService[$scope.externalId+'_error'] || $scope.running);
    $scope.inEshelf = () => (nyuEshelfService[$scope.externalId] == true);
    $scope.eshelfCheckBoxTrigger = () => {
      ($scope.inEshelf()) ? $scope.removeFromEshelf() : $scope.addToEshelf();
    };
    $scope.addToEshelf = () => { $scope.toggleInEshelf('post') };
    $scope.removeFromEshelf = () => { $scope.toggleInEshelf('delete') };
    $scope.toggleInEshelf = function(httpMethod) {
      $http(nyuEshelfService.generateRequest(httpMethod, $scope.recordData))
        .then(
          function(response) { $scope.running = false; nyuEshelfService.success(response, $scope.externalId) },
          function(response) { nyuEshelfService.failure(response, $scope.externalId) }
        );
    };

  }])
  .component('nyuEshelf', {
    controller: 'nyuEshelfController',
    require: {
      prmSearchResultAvailabilityLine: '^prmSearchResultAvailabilityLine',
      prmBriefResultContainer: '^prmBriefResultContainer'
    },
    template: '<div class="nyu-eshelf"><button class="neutralized-button md-button md-primoExplore-theme" aria-label="Toggle in e-Shelf">' +
      '<input ng-checked="inEshelf()" ng-disabled="disabled()" id="{{ elementId }}" type="checkbox" data-eshelf-external-id="{{ externalId }}" ng-click="running = true; eshelfCheckBoxTrigger()" >' +
      '<label for="{{ elementId }}"><span ng-bind-html="setElementText()"></span></label>' +
    '</button></div>'
  })
