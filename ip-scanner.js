// ==UserScript==
// @name         Chatroulette IP Scanner
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  IP Tracker for Chatroulette
// @author       VeltrixJS
// @match        https://chatroulette.com/*
// @match        https://*.chatroulette.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=chatroulette.com
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';
    
    const COLORS = { primary: '#ffd22e', dark: '#121212', white: '#fff', grey: '#1c1c1c', borderColor: '#222', red: '#ff4444' };
    const KNOWN_SERVERS = ['206.81.27', '102.105.120', '81.49.17', '154.127.57', '142.250', '172.217', '216.58', '74.125'];
    const buttonStyle = `padding:8px;border:none;background:${COLORS.primary};color:${COLORS.dark};border-radius:6px;cursor:pointer;font-weight:600;transition:all 0.2s;`;
    const cardStyle = `display:flex;flex-direction:column;background-color:${COLORS.grey};border-left:4px solid ${COLORS.primary};padding:15px;margin-bottom:12px;border-radius:8px;color:${COLORS.white};`;

    const container = Object.assign(document.createElement('div'), {
        id: 'ip-container',
        innerHTML: `
            <div id="drag-handle" style="cursor:move;margin-bottom:20px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
                    <h3 style="margin:0;color:${COLORS.primary};font-weight:800;text-transform:uppercase;letter-spacing:1px;" translate="no">Detected IP</h3>
                    <div style="display:flex;gap:8px;">
                        <button id="open-popup" style="${buttonStyle}background:transparent;border:1px solid ${COLORS.primary};color:${COLORS.primary};font-size:12px;" translate="no">📺 POPUP</button>
                        <button id="close-ip-container" style="${buttonStyle}font-weight:bold;" translate="no">X</button>
                    </div>
                </div>
            </div>
            <div id="ip-addresses"></div>
            <div style="margin-top:15px;text-align:center;">
                <a href="https://github.com/VeltrixJS" target="_blank" style="display:inline-flex;align-items:center;gap:8px;background:${COLORS.borderColor};color:${COLORS.primary};border:1px solid ${COLORS.primary};padding:8px 16px;text-decoration:none;font-weight:600;border-radius:8px;font-size:12px;transition:all 0.2s;" onmouseover="this.style.backgroundColor='${COLORS.primary}';this.style.color='${COLORS.dark}';" onmouseout="this.style.backgroundColor='${COLORS.borderColor}';this.style.color='${COLORS.primary}';" translate="no">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.757-1.333-1.757-1.089-.744.084-.729.084-.729 1.205.084 1.84 1.236 1.84 1.236 1.07 1.835 2.809 1.304 3.495.997.108-.775.418-1.305.762-1.605-2.665-.305-5.466-1.332-5.466-5.93 0-1.31.469-2.381 1.236-3.221-.124-.303-.535-1.523.117-3.176 0 0 1.008-.322 3.301 1.23a11.5 11.5 0 013.003-.404c1.018.005 2.045.138 3.003.404 2.292-1.552 3.298-1.23 3.298-1.23.653 1.653.242 2.873.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.61-2.803 5.624-5.475 5.921.43.372.823 1.102.823 2.222 0 1.606-.015 2.896-.015 3.286 0 .319.218.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg> GitHub
                </a>
            </div>
        `
    });

    Object.assign(container.style, {
        position: 'fixed', top: '10px', right: '10px', width: '400px', maxHeight: '500px',
        backgroundColor: COLORS.dark, border: `1px solid ${COLORS.primary}`, borderRadius: '16px',
        padding: '20px', zIndex: '99999', fontFamily: 'Inter,Arial,sans-serif', fontSize: '14px',
        boxShadow: `0 8px 32px rgba(255,210,46,0.2)`, color: COLORS.white, resize: 'both', overflow: 'auto'
    });

    document.body.appendChild(container);

    const miniBtn = Object.assign(document.createElement('div'), {
        id: 'mini-ip-container',
        innerHTML: `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="${COLORS.primary}" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`
    });

    Object.assign(miniBtn.style, {
        position: 'fixed', top: '10px', right: '10px', width: '50px', height: '50px',
        backgroundColor: COLORS.dark, border: `2px solid ${COLORS.primary}`, borderRadius: '50%',
        zIndex: '99999', cursor: 'pointer', display: 'none', justifyContent: 'center',
        alignItems: 'center', boxShadow: `0 0 15px ${COLORS.primary}66`
    });

    document.body.appendChild(miniBtn);

    let popupWindow = null, myIPs = new Set(), detectedIPs = new Set(), isReady = false, lastConnection = 0, rtcCounter = 0;

    const setupEvents = () => {
        document.getElementById('open-popup').onclick = () => {
            if (popupWindow && !popupWindow.closed) return popupWindow.focus();
            popupWindow = window.open('', 'IPTracker', 'width=420,height=380,left=100,top=100');
            popupWindow.document.write(`<!DOCTYPE html><html><head><title>Chatroulette IP Tracker</title><style>body{margin:0;padding:20px;background:${COLORS.dark};font-family:Inter,Arial,sans-serif;color:${COLORS.white}}h3{margin:0 0 20px;color:${COLORS.primary};text-transform:uppercase;font-size:18px;font-weight:800;letter-spacing:1px}.ip-item{${cardStyle}}.ip-item strong{color:${COLORS.primary};margin-right:5px}.time-label{margin-bottom:8px;font-size:12px;opacity:0.6}.info-line{margin-bottom:4px}.ip-buttons{display:flex;gap:8px;margin-top:12px}button{${buttonStyle}flex:1}button:hover{opacity:0.8;transform:translateY(-1px)}.maps-btn{background:${COLORS.white}!important;color:${COLORS.dark}!important}.github-link{display:inline-flex;align-items:center;gap:8px;background:${COLORS.borderColor};color:${COLORS.primary};border:1px solid ${COLORS.primary};padding:8px 16px;text-decoration:none;font-weight:600;border-radius:8px;font-size:12px;transition:all 0.2s;margin-top:15px}.github-link:hover{background:${COLORS.primary};color:${COLORS.dark}}</style></head><body><div id="ip-container"><h3>Live IP Tracker</h3><div id="ip-addresses"></div><div style="text-align:center"><a href="https://github.com/VeltrixJS" target="_blank" class="github-link"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.757-1.333-1.757-1.089-.744.084-.729.084-.729 1.205.084 1.84 1.236 1.84 1.236 1.07 1.835 2.809 1.304 3.495.997.108-.775.418-1.305.762-1.605-2.665-.305-5.466-1.332-5.466-5.93 0-1.31.469-2.381 1.236-3.221-.124-.303-.535-1.523.117-3.176 0 0 1.008-.322 3.301 1.23a11.5 11.5 0 013.003-.404c1.018.005 2.045.138 3.003.404 2.292-1.552 3.298-1.23 3.298-1.23.653 1.653.242 2.873.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.61-2.803 5.624-5.475 5.921.43.372.823 1.102.823 2.222 0 1.606-.015 2.896-.015 3.286 0 .319.218.694.825.576C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>GitHub</a></div></div></body></html>`);
            popupWindow.document.close();
        };

        document.getElementById('close-ip-container').onclick = () => {
            miniBtn.style.top = container.offsetTop + 'px';
            miniBtn.style.left = container.offsetLeft + 'px';
            container.style.display = 'none';
            miniBtn.style.display = 'flex';
        };
    };

    setupEvents();

    const makeDraggable = (el, handle) => {
        let pos = { x: 0, y: 0, mx: 0, my: 0 }, drag = { active: false, sx: 0, sy: 0 };
        handle.onmousedown = (e) => {
            e.preventDefault();
            drag = { active: false, sx: e.clientX, sy: e.clientY };
            pos.mx = e.clientX;
            pos.my = e.clientY;
            document.onmouseup = () => {
                document.onmousemove = null;
                if (!drag.active && el.id === 'mini-ip-container') {
                    container.style.top = miniBtn.offsetTop + 'px';
                    container.style.left = miniBtn.offsetLeft + 'px';
                    container.style.display = 'block';
                    miniBtn.style.display = 'none';
                    setupEvents();
                }
            };
            document.onmousemove = (e) => {
                if (Math.abs(e.clientX - drag.sx) > 5 || Math.abs(e.clientY - drag.sy) > 5) drag.active = true;
                pos.x = pos.mx - e.clientX;
                pos.y = pos.my - e.clientY;
                pos.mx = e.clientX;
                pos.my = e.clientY;
                el.style.top = (el.offsetTop - pos.y) + "px";
                el.style.left = (el.offsetLeft - pos.x) + "px";
            };
        };
    };

    makeDraggable(container, document.getElementById('drag-handle'));
    makeDraggable(miniBtn, miniBtn);

    const fetchIPInfo = async (ip) => {
        const apis = [
            { url: `http://ip-api.com/json/${ip}?fields=country,regionName,city,zip,isp,proxy,hosting`, parse: d => ({ city: d.city, region: d.regionName, postal: d.zip, country: d.country, isp: d.isp, vpn: d.proxy || d.hosting }) },
            { url: `https://ipapi.co/${ip}/json/`, parse: d => ({ city: d.city, region: d.region, postal: d.postal, country: d.country_name, isp: d.org, vpn: false }) },
            { url: `https://freeipapi.com/api/json/${ip}`, parse: d => ({ city: d.cityName, region: d.regionName, postal: d.zipCode, country: d.countryName, isp: d.org || 'N/A', vpn: d.isProxy || false }) },
            { url: `https://ipwhois.app/json/${ip}`, parse: d => ({ city: d.city, region: d.region, postal: d.postal, country: d.country, isp: d.isp, vpn: d.security?.vpn || d.security?.proxy || false }) }
        ];
        for (const api of apis) {
            try {
                const res = await Promise.race([fetch(api.url).then(r => r.json()), new Promise((_, r) => setTimeout(() => r(new Error('timeout')), 3000))]);
                if (res && res.status !== 'fail' && !res.error) return { ...api.parse(res), isp: api.parse(res).isp || 'N/A' };
            } catch (e) {}
        }
        return null;
    };

    const buildDisplay = (ip, data, time) => {
        const { city = 'Unknown', region = 'Unknown', postal = '', country = 'Unknown', isp = 'N/A', vpn = false } = data || {};
        const dept = (postal && postal.length >= 2) ? postal.substring(0, 2) : '??';
        const vpnBadge = vpn ? `<span style="background:${COLORS.red};color:white;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:bold;margin-left:8px;">🚨 VPN/PROXY</span>` : '';
        const mapsUrl = `https://www.google.com/maps/search/${encodeURIComponent(city + ' ' + country)}`;

        const item = Object.assign(document.createElement('div'), {
            innerHTML: `
                <div style="margin-bottom:8px;font-size:12px;opacity:0.6" translate="no">Detected at: ${time}</div>
                <div style="margin-bottom:4px" translate="no"><strong style="color:${COLORS.primary}">IP:</strong> ${ip}${vpnBadge}</div>
                <div style="margin-bottom:4px" translate="no"><strong style="color:${COLORS.primary}">ISP:</strong> ${isp}</div>
                <div style="margin-bottom:12px" translate="no"><strong style="color:${COLORS.primary}">LOC:</strong> ${city}, ${region} (${dept}) - ${country}</div>
                <div style="display:flex;gap:8px">
                    <button class="copy-btn" style="${buttonStyle}flex:1" translate="no">Copy</button>
                    <button class="maps-btn" style="${buttonStyle}flex:1;background:${COLORS.white};color:${COLORS.dark}" translate="no">Maps</button>
                </div>
            `
        });

        item.style.cssText = cardStyle;
        item.querySelector('.copy-btn').onclick = () => navigator.clipboard.writeText(ip);
        item.querySelector('.maps-btn').onclick = () => window.open(mapsUrl, '_blank');

        return { 
            element: item, 
            html: `<div class="ip-item"><div class="time-label">Detected at: ${time}</div><div class="info-line"><strong>IP:</strong> ${ip}${vpnBadge}</div><div class="info-line"><strong>ISP:</strong> ${isp}</div><div class="info-line" style="margin-bottom:12px"><strong>LOC:</strong> ${city}, ${region} (${dept}) - ${country}</div><div class="ip-buttons"><button onclick="navigator.clipboard.writeText('${ip}')">Copy</button><button class="maps-btn" onclick="window.open('${mapsUrl}','_blank')">Maps</button></div></div>`
        };
    };

    const isPublicIP = (ip) => ip && ip !== '0.0.0.0' && ![/^10\./, /^172\.(1[6-9]|2[0-9]|3[0-1])\./, /^192\.168\./, /^127\./, /^169\.254\./].some(p => p.test(ip));
    const isKnownServer = (ip) => KNOWN_SERVERS.some(s => ip.startsWith(s));

    const OriginalRTC = window.RTCPeerConnection || window.webkitRTCPeerConnection;

    if (OriginalRTC) {
        window.RTCPeerConnection = function(...args) {
            const now = Date.now();
            
            if (now - lastConnection > 2000) {
                rtcCounter++;
                if (rtcCounter === 1 && !isReady) {
                    setTimeout(() => isReady = true, 1000);
                }
                lastConnection = now;
            }

            const pc = new OriginalRTC(...args);

            const handleCandidate = (candidateString) => {
                if (!candidateString) return;

                const matches = candidateString.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [];
                
                for (const ip of matches) {
                    if (!isPublicIP(ip) || isKnownServer(ip) || myIPs.has(ip) || detectedIPs.has(ip)) continue;
                    
                    if (!isReady) {
                        myIPs.add(ip);
                    } else {
                        detectedIPs.add(ip);
                        const ipContainer = document.getElementById('ip-addresses');
                        ipContainer.innerHTML = '';
                        if (popupWindow && !popupWindow.closed) popupWindow.document.getElementById('ip-addresses').innerHTML = '';

                        fetchIPInfo(ip).then(geoData => {
                            const currentTime = new Date().toLocaleTimeString();
                            const { element, html } = buildDisplay(ip, geoData, currentTime);
                            ipContainer.appendChild(element);
                            if (popupWindow && !popupWindow.closed) popupWindow.document.getElementById('ip-addresses').innerHTML += html;
                        });
                    }
                }
            };

            const origAdd = pc.addIceCandidate.bind(pc);
            pc.addIceCandidate = async function(candidate, ...rest) {
                if (candidate?.candidate) handleCandidate(candidate.candidate);
                return origAdd(candidate, ...rest);
            };

            const origOnIce = pc.onicecandidate;
            pc.onicecandidate = function(event) {
                if (event?.candidate?.candidate) handleCandidate(event.candidate.candidate);
                if (origOnIce) origOnIce.call(this, event);
            };

            const origAddEvent = pc.addEventListener.bind(pc);
            pc.addEventListener = function(type, listener, ...rest) {
                if (type === 'icecandidate') {
                    const wrapped = function(event) {
                        if (event?.candidate?.candidate) handleCandidate(event.candidate.candidate);
                        return listener.call(this, event);
                    };
                    return origAddEvent('icecandidate', wrapped, ...rest);
                }
                return origAddEvent(type, listener, ...rest);
            };

            return pc;
        };

        window.RTCPeerConnection.prototype = OriginalRTC.prototype;
    }
})();
