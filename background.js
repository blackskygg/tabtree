// Copyright 2018 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

'use strict';

var data = {
  "name": "",
  "tabid": null,
  "nodeid": 0,
  "url": null,
  "favicon": "https://www.google.com/images/icons/product/chrome-32.png", // default favicon
  "children": null,
  "_children": null,
  "_pid": null
};

var session = { "scale": null, "center_node": null };
var currTab = null;
var tid2node = {}, nid2node = { 0: data };
var nid = 1;

var host_titles = {}, affixes = {};

function extractHostname(url) {
  var hostname;
  //find & remove protocol (http, ftp, etc.) and get hostname
  if (url.indexOf("://") > -1) {
    hostname = url.split('/')[2];
  }
  else {
    hostname = url.split('/')[0];
  }
  //find & remove port number
  hostname = hostname.split(':')[0];
  //find & remove "?"
  hostname = hostname.split('?')[0];
  return hostname;
}

function purifyTitle(host, title) {
  var high_freq = {
    "www.freebuf.com": ["FreeBuf互联网安全新媒体平台 | 关注黑客与极客", "新手", "教程", "指南", "DVWA"],
    "www.google.com.hk": ["Google", "Search", "Google Search"],
    "www.google.com": ["Google", "Search", "Google Search"],
    "www.zhihu.com": ["\(.*?\)", "知乎"],
    "baike.baidu.com": ["百度百科"],
    "newtab": [".*"]
  };
  if (high_freq[host]) {
    for (var i = 0; i < high_freq[host].length; ++i) {
      var re = new RegExp(high_freq[host][i], "g");
      title = title.replace(re, "");
    }
  }
  return title;
}

function update_affix(hostname, title) {
  if (!host_titles[hostname]) {
    host_titles[hostname] = [title];
    affixes[hostname] = { "prefix": "", "suffix": "" };
    return;
  } else {
    host_titles[hostname].push(title);
  }
  //recalculate prefix and suffix
  let titles = host_titles[hostname];
  var i, count = 0;
  for (i = 0; i < title.length && count >= 2; ++i) {
    var c = title[i];
    count = 0;
    for (var j = 0; j < titles.size(); ++j) {
      if (i >= titles[j].length)
        continue;
      if (titles[j][i] === c)
        count++;
    }
  }
  affixes[hostname].prefix = title.substring(0, i);

  for (i = 0; i < title.length && count >= 2; ++i) {
    var c = title[title.length - 1 - i];
    count = 0;
    for (var j = 0; j < titles.size(); ++j) {
      if (i >= titles[j].length)
        continue;
      if (titles[j][titles[j].length - 1 - i] === c)
        count++;
    }
  }
  affixes[hostname].prefix = title.substring(title.length - i);
}

function init() {
  chrome.declarativeContent.onPageChanged.removeRules(undefined, function () {
    chrome.declarativeContent.onPageChanged.addRules([{
      conditions: [new chrome.declarativeContent.PageStateMatcher()],
      actions: [new chrome.declarativeContent.ShowPageAction()]
    }]);
  });

  // get the very root-tab
  chrome.tabs.query(
    { currentWindow: true, active: true },
    function (tabArray) {
      currTab = tabArray[0];
      tid2node[currTab.id] = data;
      data.tabid = currTab.id;
    }
  );
  chrome.tabs.onCreated.addListener(function (tab) {
    // back to live
    if (tid2node[tab.id])
      return;
    // new tab, add a node and edge
    let prevNode = tid2node[currTab.id];
    let newNode = {
      "name": tab.title,
      "url": tab.url,
      "tabid": tab.id,
      "nodeid": nid,
      "children": null,
      "_children": null,
      "_pid": null,
    };
    if (newNode.name.length === 0)
      newNode.name = "loading...";
    if (prevNode._children) {
      prevNode._children.push(newNode);
      nid2node[nid] = tid2node[tab.id] = prevNode._children[prevNode._children.length - 1];
    } else {
      if (prevNode.children == null)
        prevNode.children = [];
      prevNode.children.push(newNode);
      nid2node[nid] = tid2node[tab.id] = prevNode.children[prevNode.children.length - 1];
    }
    nid2node[nid]._pid = prevNode.nodeid;
    nid++;
    chrome.runtime.sendMessage({ "type": "update" });
  });
  chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
    var expression = /[-a-zA-Z0-9@:%_\+.~#?&//=]{2,256}\.[a-z]{2,4}\b(\/[-a-zA-Z0-9@:%_\+.~#?&//=]*)?/gi;
    var regex = new RegExp(expression);
    if (!tab.title.match(regex)) {
      // process title
      let hostname = extractHostname(tab.url);
      let title = purifyTitle(hostname, tab.title);
      /*
      update_affix(hostname, title);
      var prefix = affixes[hostname].prefix, suffix = affixes[hostname].suffix;
      title = title.substring(prefix.length.size + 1, title.length - suffix.length);
      */
      var len = title.length;

      if (len > 20) {
        tid2node[tabId].name = title.substring(0, len-3)+"...";
      } else {
        tid2node[tabId].name = title;
      }
      chrome.runtime.sendMessage({ "type": "update" });
    }
    tid2node[tabId].favicon = tab.favIconUrl;
  });
  chrome.tabs.onActiveChanged.addListener(function (tabid, windid) {
    // current tab changed
    chrome.tabs.get(tabid, function (tab) {
      currTab = tab;
    });
  });
  chrome.tabs.onRemoved.addListener(function (tabId, removeInfo) {
    let node = tid2node[tabId];
    if (node._pid === null ||
      (node._children && node._children.length > 0) ||
      (node.children && node.children.length > 0))
      return;
    let parent = nid2node[node._pid];
    if (parent._children && parent._children.includes(node)) {
      let idx = parent._children.indexOf[node];
      parent._children.splice(idx, 1);
      if (parent._children.length == 0)
        parent._children.length = null;
    } else if (parent.children && parent.children.includes(node)) {
      let idx = parent.children.indexOf[node];
      parent.children.splice(idx, 1);
      if (parent.children.length == 0)
        parent.children.length = null;
    }
    chrome.runtime.sendMessage({ "type": "update" });
  });
}

chrome.runtime.onInstalled.addListener(function () {
  init();
});

chrome.runtime.onStartup.addListener(function () {
  init();
});