/*
 * Copyright (C) 2010 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/**
 * @constructor
 * @extends {WebInspector.VBox}
 * @param {!WebInspector.NetworkRequest} request
 */
WebInspector.RequestTimingView = function(request)
{
    WebInspector.VBox.call(this);
    this.element.classList.add("resource-timing-view");

    this._request = request;
}

WebInspector.RequestTimingView.prototype = {
    wasShown: function()
    {
        this._request.addEventListener(WebInspector.NetworkRequest.Events.TimingChanged, this._refresh, this);
        this._request.addEventListener(WebInspector.NetworkRequest.Events.FinishedLoading, this._refresh, this);

        if (!this._request.timing) {
            if (!this._emptyView) {
                this._emptyView = new WebInspector.EmptyView(WebInspector.UIString("This request has no detailed timing info."));
                this._emptyView.show(this.element);
                this.innerView = this._emptyView;
            }
            return;
        }

        if (this._emptyView) {
            this._emptyView.detach();
            delete this._emptyView;
        }

        this._refresh();
    },

    willHide: function()
    {
        this._request.removeEventListener(WebInspector.NetworkRequest.Events.TimingChanged, this._refresh, this);
        this._request.removeEventListener(WebInspector.NetworkRequest.Events.FinishedLoading, this._refresh, this);
    },

    _refresh: function()
    {
        if (this._tableElement)
            this._tableElement.remove();

        this._tableElement = WebInspector.RequestTimingView.createTimingTable(this._request);
        this.element.appendChild(this._tableElement);
    },

    __proto__: WebInspector.VBox.prototype
}


/**
 * @param {!WebInspector.NetworkRequest} request
 * @return {!Element}
 */
WebInspector.RequestTimingView.createTimingTable = function(request)
{
    var tableElement = document.createElementWithClass("table", "network-timing-table");

    /**
     * @param {string} title
     * @param {string} className
     * @param {number} start
     * @param {number} end
     */
    function addRow(title, className, start, end)
    {
        var tr = tableElement.createChild("tr");
        tr.createChild("td").createTextChild(title);
        var td = tr.createChild("td");
        td.width = chartWidth + "px";
        var row = td.createChild("div", "network-timing-row");

        var bar = row.createChild("span", "network-timing-bar " + className);
        bar.style.left = Math.floor(scale * start) + "px";
        bar.style.right = Math.floor(scale * (total - end)) + "px";
        bar.textContent = "\u200B"; // Important for 0-time items to have 0 width.

        var label = row.createChild("span", "network-timing-bar-title");
        if (total - end < start)
            label.style.right = (scale * (total - end)) + "px";
        else
            label.style.left = (scale * start) + "px";
        label.textContent = Number.secondsToString((end - start) / 1000, true);
    }

    /**
     * @param {!Array.<number>} numbers
     * @return {number|undefined}
     */
    function firstPositive(numbers)
    {
        for (var i = 0; i < numbers.length; ++i) {
            if (numbers[i] > 0)
                return numbers[i];
        }
        return undefined;
    }

    function createCommunicationTimingTable()
    {
        if (blocking > 0)
            addRow(WebInspector.UIString("Stalled"), "blocking", 0, blocking);

        if (timing.proxyStart !== -1)
            addRow(WebInspector.UIString("Proxy negotiation"), "proxy", timing.proxyStart, timing.proxyEnd);

        if (timing.dnsStart !== -1)
            addRow(WebInspector.UIString("DNS Lookup"), "dns", timing.dnsStart, timing.dnsEnd);

        if (timing.connectStart !== -1)
            addRow(WebInspector.UIString("Initial connection"), "connecting", timing.connectStart, timing.connectEnd);

        if (timing.sslStart !== -1)
            addRow(WebInspector.UIString("SSL"), "ssl", timing.sslStart, timing.sslEnd);

        addRow(WebInspector.UIString("Request sent"), "sending", timing.sendStart, timing.sendEnd);
        addRow(WebInspector.UIString("Waiting (TTFB)"), "waiting", timing.sendEnd, timing.receiveHeadersEnd);

        if (request.endTime !== -1)
            addRow(WebInspector.UIString("Content Download"), "receiving", (request.responseReceivedTime - timing.requestTime) * 1000, total);
    }

    function createServiceWorkerTimingTable()
    {
        addRow(WebInspector.UIString("Stalled"), "blocking", 0, timing.serviceWorkerFetchStart);

        addRow(WebInspector.UIString("Request to ServiceWorker"), "serviceworker", timing.serviceWorkerFetchStart, timing.serviceWorkerFetchEnd);
        addRow(WebInspector.UIString("ServiceWorker Preparation"), "serviceworker", timing.serviceWorkerFetchStart, timing.serviceWorkerFetchReady);
        addRow(WebInspector.UIString("Waiting (TTFB)"), "waiting", timing.serviceWorkerFetchEnd, timing.receiveHeadersEnd);

        if (request.endTime !== -1)
            addRow(WebInspector.UIString("Content Download"), "receiving", (request.responseReceivedTime - timing.requestTime) * 1000, total);
    }

    var timing = request.timing;
    var blocking = firstPositive([timing.dnsStart, timing.connectStart, timing.sendStart]);
    var endTime = firstPositive([request.endTime, request.responseReceivedTime, timing.requestTime]);
    var total = (endTime - timing.requestTime) * 1000;
    const chartWidth = 200;
    var scale = chartWidth / total;

    if (request.fetchedViaServiceWorker)
        createServiceWorkerTimingTable();
    else
        createCommunicationTimingTable();

    if (!request.finished) {
        var cell = tableElement.createChild("tr").createChild("td", "caution");
        cell.colSpan = 2;
        cell.createTextChild(WebInspector.UIString("CAUTION: request is not finished yet!"));
    }

    return tableElement;
}