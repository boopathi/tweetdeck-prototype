var Promise = require('rsvp').Promise;
var defaults = require('./utils').defaults;

module.exports = function fetch(url, opts) {
  return new Promise(function(resolve, reject) {
    opts = defaults(opts, {
      method: "GET",
      headers: {},
      body: undefined,
      credentials: 'omit',
      type: 'text'
    });

    var xhr = new XMLHttpRequest();
    xhr.open(opts.method, url, true);
    xhr.responseType = opts.type;
    xhr.withCredentials = (opts.credentials == 'include');

    Object.keys(opts.headers).forEach(function (k) {
      xhr.setRequestHeader(k, opts.headers[k]);
    });

    xhr.onload = function() {
      resolve(xhr.response);
    };

    xhr.onerror = function() {
      reject(Error("Network error"));
    };

    xhr.send(opts.body);
  });
};
