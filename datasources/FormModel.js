/*jslint node: true */
'use strict';

var mongoose = require('mongoose');
// var util = require('../util');

var formSchema = new mongoose.Schema({
  // We don't use the native mongo ID when communicating with clients.
  _id: { type: mongoose.Schema.Types.ObjectId, select: false },
  __v: { type: Number, select: false },
  id: String,
  survey: String,
  created: Date,
  type: { type: String },
  questions: [], // Used by mobile forms
  global: {}, // Used by paper forms
  parcels: [] // Used by paper forms
});

formSchema.set('toObject', {
  transform: function (doc, ret, options) {
    var obj = {
      id: ret.id,
      survey: ret.survey,
      created: ret.created,
      type: ret.type
    };

    if (ret.type === 'mobile') {
      obj.questions = ret.questions;
    } else if (ret.type === 'paper') {
      obj.global = ret.global;
      obj.parcels = ret.parcels;
    }

    return obj;
  }
});

// Set the ID.
// formSchema.pre('save', function setId(next) {
//   this.id = util.uuidv1();
//   next();
// });

// Set the creation date.
formSchema.pre('save', function setCreated(next) {
  this.created = new Date();
  next();
});

var Form = module.exports = mongoose.model('Form', formSchema, 'formCollection');
