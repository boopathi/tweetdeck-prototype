'use strict';

var tweetdeck = require('../lib/tweetdeck');
var utils = require('../lib/utils');

var React = require('react');
var DOM = React.DOM;

var ModalDialog = React.createFactory(require('./modal-dialog'));
var SMSAuthChallengeView = React.createFactory(require('./login/smsauthchallenge'));
var MobileAppAuthChallengeView = React.createFactory(require('./login/mobileappauthchallenge'));
var UserPassView = React.createFactory(require('./login/userpass'));

module.exports = React.createClass({
  displayName: 'LoginView',

  propTypes: {
    onLoginSuccess: React.PropTypes.func.isRequired
  },

  getDefaultProps: function () {
    return {
      mobileAuthRequestPollInterval: 5000,
      mobileAuthRequestLimit: 10
    };
  },

  getInitialState: function () {
    return {
      inProgress: false,
      twoFactorChallenge: {},
      mobileAuthRequestCount: 0
    };
  },

  showLoginError: function (err) {
    this.setState({
      inProgress: false,
      loginMessage: err.message
    });
  },

  onLoginSubmit: function (username, password) {
    this.setState({
      inProgress: true
    });
    this.login(username, password)
      .then(this.props.onLoginSuccess, this.showLoginError);
  },

  login: function(username, password) {
    return tweetdeck
      .login(username, password)
      .then(this.handleLoginResponse);
  },

  /**
   * handleLoginResponse()
   * All login/2fa HTTP responses are handled through this single function, which will either
   * a) Indentify that further authentication is required for 2FA (response.twoFactorChallenge),
   * b) Identify and reject on upstream xAuth errors (response.xAuthError),
   * c) Identify and reject on tdapi errors (response.error),
   * d) resolve with a successful response (user object).
   */
  handleLoginResponse: function (response) {
    return new Promise(function (resolve, reject) {

      if (response.twoFactorChallenge) {
        if (response.twoFactorChallenge.viaSMSCode) {
          return this.authenticateViaSMSCode(response.twoFactorChallenge).then(resolve);
        }
        if (response.twoFactorChallenge.viaMobileApp) {
          return this.authenticateViaMobileApp(response.twoFactorChallenge).then(resolve);
        }
      }

      if (response.xAuthError && response.xAuthError.code) {
        return reject(Error(this.getXAuthErrorMessageForCode(response.xAuthError.code)));
      }

      if (response.error) {
        return reject(Error('Code should deal with this error: ' + response.error));
      }

      return resolve(response);
    }.bind(this));
  },

  /**
   * authenticateViaSMSCode()
   * Waits for the user to enter SMS code, then sends for authentication.
   */
  authenticateViaSMSCode: function(twoFactorChallenge) {
    return this.getSMSCodeFromUser(twoFactorChallenge)
      .then(function (code) {
        return this.attemptTwoFactor({ code: code })
      }.bind(this))
      .then(this.handleLoginResponse);
  },

  /**
   * authenticateViaMobileApp()
   * Polls the login endpoint every 2s waiting for the user to authenticate via the mobile app.
   * Rejects once mobileAuthRequestLimit is reached.
   */
  authenticateViaMobileApp: function (twoFactorChallenge) {
    return new Promise(function (resolve, reject) {
      this.setState({
        inProgress: false,
        twoFactorChallenge: this.mergeTwoFactorChallengeState(twoFactorChallenge)
      });

      var mobileAuthTimeout;
      if (this.state.mobileAuthRequestCount >= this.props.mobileAuthRequestLimit) {
        clearTimeout(mobileAuthTimeout);
        return reject(Error('You took too long to authenticate via the mobile app'));
      }

      this.setState({
        mobileAuthRequestCount: this.state.mobileAuthRequestCount + 1
      });

      mobileAuthTimeout = setTimeout(function () {
        this.attemptTwoFactor()
          .then(this.handleLoginResponse)
          .then(resolve);
      }.bind(this), this.props.mobileAuthRequestPollInterval);
    }.bind(this));
  },

  getSMSCodeFromUser: function (twoFactorChallenge) {
    return new Promise(function (resolve, reject) {
      this.setState({
        inProgress: false,
        twoFactorChallenge: this.mergeTwoFactorChallengeState(twoFactorChallenge),
        loginMessage: twoFactorChallenge.error && twoFactorChallenge.error.message ||
          'SMS code required.',
        onMobileCodeSubmit: resolve
      });
    }.bind(this));
  },

  attemptTwoFactor: function (opts) {
    this.setState({
      inProgress: true
    });
    opts = utils.defaults(opts, {
      requestId: this.state.twoFactorChallenge.requestId,
      userId: this.state.twoFactorChallenge.userId,
    });

    return tweetdeck.verifyTwoFactor(opts);
  },

  mergeTwoFactorChallengeState: function (twoFactorChallenge) {
    return utils.defaults(twoFactorChallenge, {
      requestId: this.state.twoFactorChallenge.requestId,
      userId: this.state.twoFactorChallenge.userId
    });
  },

  getXAuthErrorMessageForCode: function (code) {
    var xAuthErrors = {
      '32': 'User/pass incorrect',
      '236': 'SMS auth code incorrect'
    };
    var message;

    try {
      message = xAuthErrors[code.toString()];
    } catch (e) {
      message = 'Unknown xAuth error';
    }
    return message;
  },

  getContent: function () {
    if (this.state.twoFactorChallenge.viaSMSCode) {
      return SMSAuthChallengeView({
        loginMessage: this.state.loginMessage,
        onSubmit: this.state.onMobileCodeSubmit
      });
    }

    if (this.state.twoFactorChallenge.viaMobileApp) {
      return MobileAppAuthChallengeView({});
    }

    return UserPassView({
      loginMessage: this.state.loginMessage,
      onSubmit: this.onLoginSubmit
    });
  },

  render: function () {
    return ModalDialog({
      contentComponent: DOM.div({},
        (this.state.inProgress ?
          DOM.img({ src: 'static/imgs/spinner-bubbles.svg', className: 'loading-spinner' }) :
          this.getContent())
      )
    });

  }
});
