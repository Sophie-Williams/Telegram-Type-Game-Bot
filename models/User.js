'use strict';
//jscs:disable requireCamelCaseOrUpperCaseIdentifiers

var mongoose  = require('mongoose');
var Telegram  = require('../lib/telegram');
var Clicks    = require('../lib/clicks');
var _         = require('lodash');
var api       = new Telegram();

var sendMessageError = function(id, message) {
  api.request('sendMessage', {
    chat_id: id,
    text: message || '(501) Ocurrió un error. Inténtalo mas tarde.'
  });
};

var userSchema = mongoose.Schema({
  userid: {
    type: Number,
    required: true
  },
  requests: {
    type: Number,
    default: 0
  },
  lastRequest: {
    type: Number,
    default: Date.now
  },
  clicks: {
    type: Number,
    default: 0,
    index: true
  },
  lastClick: {
    type: Number,
    default: Date.now
  },
  upgrades: [{
    id: {
      type: String,
      required: true
    },
    buyed: [{
      type: Number
    }]
  }]
});

userSchema.methods.getTotalClicks = Clicks();

userSchema.statics.findTelegramUser = function(req, res, next) {
  var User = mongoose.model('User');
  var user = req.body.message.chat.id;
  User.findOneAndUpdate(
    {userid: user},
    {$inc: {requests: 1}, $set: {lastRequest: Date.now()}},
    {upsert: true},
    function(err, doc) {
      if (err) {
        sendMessageError(req.body.message.chat.id);
        return console.error(err);
      }
      req.user = doc;
      next();
    }
  );
};

userSchema.statics.incrementClicks = function(user, cb) {
  var User = mongoose.model('User');
  User.findOneAndUpdate(
    {_id: user.id},
    {$inc: {clicks: 1}, $set: {lastClick: Date.now()}},
    {new: true},
    function(err, doc) {
      if (err) {
        sendMessageError(user.userid);
        return console.error(err);
      }
      cb(doc);
    }
  );
};

userSchema.statics.buyUpgrade = function(user, upgrade, cb) {
  var User = mongoose.model('User');
  if (user.getTotalClicks() < upgrade.getCost(user)) {
    return sendMessageError(user.userid,
      'No tienes suficientes clicks para comprarlo.');
  }

  var findQuery = {
    _id: user.id, upgrades: {id: upgrade.id}
  };
  var updateQuery = {
    $push: {'upgrades.$.buyed': Date.now()},
    $set: {lastBuy: Date.now()}
  };

  // First buy
  if (!_.filter(user.upgrades, _.matches({id: upgrade.id}))) {
    delete findQuery.upgrades;
    delete updateQuery.$push;
    updateQuery.$addToSet = {upgrades: {id: upgrade.id, buyed: [Date.now()]}};
  }

  User.findOneAndUpdate(findQuery, updateQuery, {new: true},
    function(err, doc) {
      if (err) {
        sendMessageError(user.userid);
        return console.error(err);
      }
      cb(doc);
    }
  );
};

userSchema.statics.resetUser = function(user, cb) {
  var User = mongoose.model('User');
  // Todo, add score before reset.
  User.findOneAndUpdate({_id: user.id}, {$set: {clicks: 0}}, {new: true},
    function(err, doc) {
      if (err) {
        sendMessageError(user.userid);
        return console.error(err);
      }
      cb(doc);
    }
  );
};

var User = mongoose.model('User', userSchema);

module.exports = User;
