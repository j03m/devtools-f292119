var express = require('express');
var app = module.exports.app = exports.app = express();
app.use(require('connect-livereload')());
app.use(express.static(__dirname));

app.listen(8082);