"use strict";

var sqlite3 = require('sqlite3').verbose();
var db 		= new sqlite3.Database('./test.db');
var Segment = require('segment');

var segment = new Segment();
segment
	// 识别模块
	// 强制分割类单词识别
	.use('URLTokenizer')            // URL识别
	.use('WildcardTokenizer')       // 通配符，必须在标点符号识别之前
	.use('PunctuationTokenizer')    // 标点符号识别
	.use('ForeignTokenizer')        // 外文字符、数字识别，必须在标点符号识别之后
	// 中文单词识别
	.use('SingleTokenizer')           // 单字拆分

	// 优化模块
	.use('EmailOptimizer')          // 邮箱地址识别
	.use('DatetimeOptimizer')       // 日期时间识别优化

	// 字典文件
	.loadDict('wildcard.txt', 'WILDCARD', true);  // 通配符

function update(id, content){
	var dict = segment.doSegment(content);
	var words = ""
	for (var i in dict) {
		words = words + " " + dict[i].w;
	}
	console.log('[index]', id, words);
	db.serialize(function() {
		db.run("CREATE VIRTUAL TABLE IF NOT EXISTS messages USING fts4(content TEXT)");
		var stmt = db.prepare("REPlACE INTO messages (docid, content) VALUES (?,?)");
		stmt.run(id, words);
		stmt.finalize();
	});
	return true;
}

function search(keywords, offset){
	var offset = offset || 0;
	var keywords = keywords.trim() || '';
	return new Promise(function(resolve, reject){
		var quoted_keywords = "";
		var arr = keywords.split(/(\s+)/);
		for (var i in arr) {
			if (arr[i].trim().length == 0) {
				continue;
			}
			var dict = segment.doSegment(arr[i]);
			if (dict.length > 1) {
				quoted_keywords +=' "'
				for (var j in dict) {
					quoted_keywords += dict[j].w +" ";
				}
				quoted_keywords = quoted_keywords.trim()
				quoted_keywords +='"'
			} else {
				quoted_keywords += " "+ arr[i];
			}
		}
		var result = new Object();
		result.docs = [];
		var limit = " LIMIT 10 OFFSET " + offset;
		quoted_keywords = "'"+quoted_keywords.trim()+"'";
		var sql = "SELECT docid FROM messages WHERE content MATCH " + quoted_keywords + limit;
		console.log('[search]', sql);
		db.each(sql, function(err, row) {
			if (err) throw err;
			result.docs.push(row.docid);
		}, function(err, num) {
			resolve(result);
		});
	})
}

function highlight(content, keywords, opentag, closetag, maxlength) {
	var keywords = keywords.trim() || '';
	var arr = keywords.split(/(\s+)/);
	var found = false;
	for (var i in arr) {
		if (arr[i].trim().length == 0) {
			continue;
		}
		var a = new RegExp(arr[i],"g")
		var len = content.length;
		content = content.replace(a,(0x0001 + arr[i] + 0x0002));
	}
	content = content.replace(new RegExp(0x0001, 'g'), opentag);
	content = content.replace(new RegExp(0x0002, 'g'), closetag);
    return content;
}

//app.use("/optimize", function(req, res){
//	db.run("INSERT INTO messages(messages) VALUES('optimize');");
//	res.end('OK');
//})

function sendMsg(msg){
	process.send(msg);
}

process.on('message',function(msg){
	var mid = msg.mid;
	var action = msg.action;
	if(action === 'update'){
		var respMsg = {
			"mid":mid,
			"success":true,
			"result": update(msg.params.id, msg.params.content)
		}
		sendMsg(respMsg);
	}else if(action === 'search'){
		search(msg.params.keywords, msg.params.offset).then(function(data){
			var respMsg = {
				"mid":mid,
				"success":true,
				"result":data
			}
			sendMsg(respMsg);
		},function(errMsg){
			var respMsg = {
				"mid":mid,
				"success":false,
				"result":errMsg
			}
			sendMsg(respMsg);
		})
	} else if(action === 'highlight'){
		var respMsg = {
			"mid":mid,
			"success":true,
			"result": highlight(msg.params.content, 
				msg.params.keywords, 
				msg.params.opentag, 
				msg.params.closetag,
				msg.maxlength)
		}
		sendMsg(respMsg);		
	}
})