/* Sri Sri Kameshwari Kitchen - progressive single-page ordering flow */
(function () {
    'use strict';

    var STEPS = ['placed', 'preparing', 'out_for_delivery', 'delivered'];
    var STAR_LABELS = {1: 'Poor', 2: 'Fair', 3: 'Good', 4: 'Very Good', 5: 'Excellent'};

    function ready(fn) {
        if (document.readyState !== 'loading') { fn(); }
        else { document.addEventListener('DOMContentLoaded', fn); }
    }

    function rpc(url, params) {
        return fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({jsonrpc: '2.0', method: 'call', params: params || {}}),
        }).then(function (r) { return r.json(); }).then(function (data) {
            if (data.error) {
                throw new Error((data.error.data && data.error.data.message) || data.error.message || 'Server error');
            }
            return data.result;
        });
    }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c];
        });
    }
    function money(n) { return '₹' + n.toFixed(2); }
    function money0(n) { return '₹' + (Number.isInteger(n) ? n : n.toFixed(2)); }

    ready(function () {
        var app = document.getElementById('sskk-app');
        if (!app) { return; }

        var GST = parseFloat(app.dataset.gst) || 5;
        var DELIVERY = parseFloat(app.dataset.delivery) || 40;
        var $ = function (sel) { return document.querySelector(sel); };

        var sec = {
            customer: $('#sskk-customer'), summary: $('#sskk-summary'),
            payment: $('#sskk-payment'), feedback: $('#sskk-feedback'),
        };
        var rows = Array.prototype.slice.call(app.querySelectorAll('.sskk-item'));
        var qty = {};
        rows.forEach(function (r) { qty[r.dataset.id] = 0; });

        var order = null, locked = false, pollTimer = null, rating = 5, toastTimer = null;

        function setProgress(n) {
            document.querySelectorAll('#sskk-progress span').forEach(function (s) {
                var p = parseInt(s.dataset.p, 10);
                s.classList.toggle('is-done', p < n);
                s.classList.toggle('is-on', p === n);
            });
        }
        function toast(msg) {
            var t = $('#sskk-toast');
            t.textContent = msg; t.hidden = false;
            clearTimeout(toastTimer);
            toastTimer = setTimeout(function () { t.hidden = true; }, 2400);
        }
        function confetti() {
            var cols = ['#e8892b', '#ffc857', '#16a34a', '#a3210f', '#ffffff'];
            for (var i = 0; i < 70; i++) {
                var d = document.createElement('i');
                d.className = 'sskk-confetti';
                d.style.cssText = 'left:' + (Math.random() * 100) + 'vw;background:' + cols[i % 5] +
                    ';animation-delay:' + (Math.random() * 0.7) + 's;--dx:' + (Math.random() * 200 - 100) +
                    'px;--rot:' + (Math.random() * 720) + 'deg';
                document.body.appendChild(d);
                setTimeout(function (el) { el.remove(); }, 4200, d);
            }
        }
        function updateCartBar(items, t) {
            var n = items.reduce(function (s, i) { return s + i.qty; }, 0);
            $('#sskk-pill-count').textContent = n;
            $('#sskk-pill-total').textContent = money0(t.total);
            $('#sskk-fab-count').textContent = n;
            $('#sskk-fab-total').textContent = money0(t.total);
            $('#sskk-fab').hidden = locked || n === 0;
        }
        function filterRows() {
            var q = ($('#sskk-search').value || '').trim().toLowerCase(), only = $('#sskk-only-sel').checked, shown = 0;
            rows.forEach(function (r) {
                var ok = r.dataset.name.toLowerCase().indexOf(q) !== -1 && (!only || qty[r.dataset.id] > 0);
                r.hidden = !ok;
                if (ok) { shown++; }
            });
            $('#sskk-nomatch').hidden = shown > 0;
        }
        function visible(el) { return el && el.getClientRects().length > 0; }
        function fly(fromEl, emoji) {
            var target = [$('#sskk-pill'), $('#sskk-fab')].filter(visible)[0];
            if (!target || !fromEl.animate) { return; }
            var a = fromEl.getBoundingClientRect(), b = target.getBoundingClientRect();
            var f = document.createElement('div');
            f.textContent = emoji;
            f.style.cssText = 'position:fixed;z-index:3000;font-size:1.8rem;pointer-events:none;left:' + a.left + 'px;top:' + a.top + 'px';
            document.body.appendChild(f);
            var dx = b.left - a.left, dy = b.top - a.top;
            f.animate([
                {transform: 'translate(0,0) scale(1)', opacity: 1},
                {transform: 'translate(' + (dx * 0.5) + 'px,' + (dy * 0.5 - 70) + 'px) scale(1.5)', opacity: 1, offset: 0.5},
                {transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.3)', opacity: .2}
            ], {duration: 750, easing: 'cubic-bezier(.4,0,.2,1)'}).onfinish = function () {
                f.remove();
                target.classList.remove('pop'); void target.offsetWidth; target.classList.add('pop');
            };
        }
        function animateNum(el, to) {
            var from = el._v || 0, start = null;
            el._v = to;
            function step(ts) {
                if (start === null) { start = ts; }
                var k = Math.min((ts - start) / 450, 1), e = 1 - Math.pow(1 - k, 3);
                el.textContent = money(from + (to - from) * e);
                if (k < 1) { requestAnimationFrame(step); }
            }
            requestAnimationFrame(step);
        }
        function goCart() { $('#sskk-cart').scrollIntoView({behavior: 'smooth', block: 'start'}); }

        /* ---------- helpers ---------- */
        function reveal(el) {
            el.hidden = false;
            setTimeout(function () { el.scrollIntoView({behavior: 'smooth', block: 'start'}); }, 60);
        }

        function cartItems() {
            return rows.filter(function (r) { return qty[r.dataset.id] > 0; }).map(function (r) {
                return {id: r.dataset.id, name: r.dataset.name, price: parseFloat(r.dataset.price), qty: qty[r.dataset.id]};
            });
        }

        function totals(items) {
            var sub = items.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
            var tax = Math.round(sub * GST) / 100;
            var delivery = items.length ? DELIVERY : 0;
            return {sub: sub, tax: tax, delivery: delivery, total: sub + tax + delivery};
        }

        /* ---------- FR-02 / FR-03: quantity controller ---------- */
        function renderRow(row) {
            var q = qty[row.dataset.id], price = parseFloat(row.dataset.price);
            row.querySelector('.sskk-qty').textContent = q;
            row.querySelector('.sskk-line-total').textContent = money0(price * q);
            row.classList.toggle('is-active', q > 0);
        }

        function changeQty(row, dir) {
            if (locked) { return; }
            var id = row.dataset.id, min = parseInt(row.dataset.min, 10), cur = qty[id], n;
            if (dir > 0) {
                n = (cur === 0) ? min : cur + 1;        // + from 0 jumps to Minimum Qty
            } else {
                n = (cur <= min) ? 0 : cur - 1;         // - at/below Minimum Qty drops to 0
            }
            qty[id] = n;
            renderRow(row);
            row.classList.remove('bump'); void row.offsetWidth; row.classList.add('bump');
            if (dir > 0) { fly(row.querySelector('.sskk-plus'), (row.dataset.icon || '🍽️')); }
            if (dir > 0 && cur === 0 && min > 1) { toast(row.dataset.name + ': minimum order is ' + min); }
            recalc();
        }

        rows.forEach(function (row) {
            row.querySelector('.sskk-plus').addEventListener('click', function () { changeQty(row, 1); });
            row.querySelector('.sskk-minus').addEventListener('click', function () { changeQty(row, -1); });
        });

        /* ---------- FR-04: live cart ---------- */
        function itemRowsHtml(items) {
            if (!items.length) { return '<tr><td colspan="3" class="sskk-empty">No items selected yet.</td></tr>'; }
            return items.map(function (i) {
                return '<tr><td>' + esc(i.name) + '</td><td>' + i.qty + '</td><td>' + money(i.price * i.qty) + '</td></tr>';
            }).join('');
        }

        function billHtml(t) {
            return '<div><span>Subtotal:</span><b>' + money(t.sub) + '</b></div>' +
                '<div><span>Tax (' + GST + '%):</span><b>' + money(t.tax) + '</b></div>' +
                '<div><span>Delivery:</span><b>' + money(t.delivery) + '</b></div>' +
                '<div class="sskk-bill-total"><span>Total:</span><b>' + money(t.total) + '</b></div>';
        }

        function recalc() {
            var items = cartItems(), t = totals(items);
            $('#sskk-cart-body').innerHTML = itemRowsHtml(items);
            $('#sskk-subtotal').textContent = money(t.sub);
            $('#sskk-tax-label').textContent = 'Tax (' + GST + '% GST):';
            $('#sskk-tax').textContent = money(t.tax);
            $('#sskk-delivery').textContent = money(t.delivery);
            animateNum($('#sskk-total'), t.total);
            updateCartBar(items, t);
            if (!locked) { setProgress(!sec.summary.hidden ? 4 : (!sec.customer.hidden ? 3 : (items.length ? 2 : 1))); }
            filterRows();

            $('#sskk-proceed').hidden = locked || items.length === 0;   // only when cart > 0
            if (!locked) {
                if (!items.length) {
                    sec.customer.hidden = true;
                    sec.summary.hidden = true;
                } else if (!sec.summary.hidden) {
                    renderSummary();
                }
            }
        }

        /* ---------- FR-05: customer form ---------- */
        $('#sskk-proceed').addEventListener('click', function () { setProgress(3); reveal(sec.customer); });

        /* ---------- FR-06: order summary ---------- */
        function renderSummary() {
            var items = cartItems(), t = totals(items);
            $('#sskk-sum-customer').innerHTML =
                '<p><b>Name:</b> ' + esc($('#sskk-name').value.trim()) + '</p>' +
                '<p><b>Phone:</b> ' + esc($('#sskk-phone').value.trim()) + '</p>' +
                '<p><b>Address:</b> ' + esc($('#sskk-address').value.trim()) + '</p>';
            $('#sskk-sum-items').innerHTML = itemRowsHtml(items);
            $('#sskk-sum-bill').innerHTML = billHtml(t);
        }

        $('#sskk-form').addEventListener('submit', function (e) {
            e.preventDefault();
            if (locked || !cartItems().length) { return; }
            renderSummary();
            setProgress(4);
            reveal(sec.summary);
        });

        /* ---------- FR-07: place order + UPI QR ---------- */
        function setLocked() {
            locked = true;
            app.querySelectorAll('.sskk-qtyctl button').forEach(function (b) { b.disabled = true; });
            $('#sskk-proceed').hidden = true;
            $('#sskk-next').disabled = true;
            $('#sskk-place').disabled = true;
            ['#sskk-name', '#sskk-phone', '#sskk-address'].forEach(function (s) { $(s).readOnly = true; });
        }

        $('#sskk-place').addEventListener('click', function () {
            var items = cartItems(), btn = this, err = $('#sskk-error');
            if (!items.length) { return; }
            err.hidden = true;
            btn.disabled = true;
            rpc('/sskk/order/create', {
                name: $('#sskk-name').value, phone: $('#sskk-phone').value, address: $('#sskk-address').value,
                items: items.map(function (i) { return {id: parseInt(i.id, 10), qty: i.qty}; }),
            }).then(function (res) {
                if (!res || !res.ok) { throw new Error((res && res.error) || 'Could not place order.'); }
                order = res;
                setLocked();
                $('#sskk-due').textContent = money(res.grand_total);
                $('#sskk-order-id').textContent = res.order_id;
                $('#sskk-qr-img').src = res.qr_url;
                $('#sskk-upi-link').href = res.upi_uri;
                setProgress(5);
                reveal(sec.payment);
            }).catch(function (e) {
                err.textContent = e.message;
                err.hidden = false;
                btn.disabled = false;
            });
        });

        /* ---------- FR-08: payment confirmation + live tracking ---------- */
        function renderStepper(status) {
            var idx = STEPS.indexOf(status);
            var pct = Math.max(idx, 0) / (STEPS.length - 1) * 100;
            $('#sskk-track').hidden = false;
            $('#sskk-track-fill').style.width = pct + '%';
            $('#sskk-rider').style.left = pct + '%';
            document.querySelectorAll('#sskk-stepper li').forEach(function (li, i) {
                li.classList.toggle('is-done', i < idx || (i === idx && idx === STEPS.length - 1));
                li.classList.toggle('is-current', i === idx);
                li.classList.toggle('is-final', i === idx && idx === STEPS.length - 1);
            });
        }

        function startPolling() {
            function tick() {
                rpc('/sskk/order/status', {order: order.order_id, token: order.token}).then(function (r) {
                    if (!r || !r.ok) { return; }
                    renderStepper(r.status);
                    if (r.status === 'delivered') {
                        clearInterval(pollTimer);
                        setProgress(7);
                        if (sec.feedback.hidden) { confetti(); reveal(sec.feedback); }   // FR-09
                    }
                }).catch(function () { /* retry on next tick */ });
            }
            tick();
            pollTimer = setInterval(tick, 4000);
        }

        $('#sskk-paid').addEventListener('click', function () {
            var btn = this;
            btn.disabled = true;
            rpc('/sskk/order/pay', {order: order.order_id, token: order.token}).then(function (r) {
                if (!r || !r.ok) { throw new Error((r && r.error) || 'Payment could not be confirmed.'); }
                $('#sskk-pay-box').hidden = true;
                var banner = $('#sskk-pay-banner');
                banner.textContent = '🎉 Payment Successful! Your Order is Placed. (ID: ' + r.order_id + ')';
                banner.hidden = false;
                $('#sskk-stepper').hidden = false;
                renderStepper(r.status);
                setProgress(6);
                confetti();
                startPolling();
            }).catch(function (e) {
                alert(e.message);
                btn.disabled = false;
            });
        });

        /* ---------- FR-09: star rating + feedback ---------- */
        function renderStars() {
            document.querySelectorAll('#sskk-stars button').forEach(function (b) {
                b.classList.toggle('is-on', parseInt(b.dataset.v, 10) <= rating);
            });
            $('#sskk-star-label').textContent = '(' + rating + '/5) - ' + STAR_LABELS[rating];
        }
        document.querySelectorAll('#sskk-stars button').forEach(function (b) {
            b.addEventListener('click', function () { rating = parseInt(b.dataset.v, 10); renderStars(); });
        });
        renderStars();

        $('#sskk-fb-submit').addEventListener('click', function () {
            var btn = this, err = $('#sskk-fb-error');
            err.hidden = true;
            btn.disabled = true;
            rpc('/sskk/order/feedback', {
                order: order.order_id, token: order.token,
                rating: rating, comments: $('#sskk-comments').value,
            }).then(function (r) {
                if (!r || !r.ok) { throw new Error((r && r.error) || 'Could not save feedback.'); }
                $('#sskk-fb-form').hidden = true;
                $('#sskk-fb-thanks').hidden = false;
            }).catch(function (e) {
                err.textContent = e.message;
                err.hidden = false;
                btn.disabled = false;
            });
        });

        /* 3D tilt on product cards */
        rows.forEach(function (row) {
            row.addEventListener('mousemove', function (e) {
                var r = row.getBoundingClientRect();
                row.style.setProperty('--ry', (((e.clientX - r.left) / r.width - 0.5) * 8).toFixed(2) + 'deg');
                row.style.setProperty('--rx', ((0.5 - (e.clientY - r.top) / r.height) * 8).toFixed(2) + 'deg');
            });
            row.addEventListener('mouseleave', function () {
                row.style.setProperty('--rx', '0deg'); row.style.setProperty('--ry', '0deg');
            });
        });

        /* dark / light theme */
        var wrap = document.querySelector('.sskk-wrap'), tbtn = $('#sskk-theme');
        function applyTheme(t) { wrap.setAttribute('data-theme', t); tbtn.textContent = t === 'dark' ? '☀️' : '🌙'; }
        var saved = 'light';
        try { saved = localStorage.getItem('sskk-theme') || 'light'; } catch (e) { /* ignore */ }
        applyTheme(saved);
        tbtn.addEventListener('click', function () {
            var n = wrap.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            applyTheme(n);
            try { localStorage.setItem('sskk-theme', n); } catch (e) { /* ignore */ }
        });

        /* v4 effects: stagger, spotlight, ripple, parallax, particles */
        rows.forEach(function (r, i) { r.style.setProperty('--i', i); });
        document.addEventListener('mousemove', function (e) {
            var t = e.target.closest && e.target.closest('.sskk-item, .sskk-card, .sskk-stats div');
            if (!t) { return; }
            var b = t.getBoundingClientRect();
            t.style.setProperty('--mx', (e.clientX - b.left) + 'px');
            t.style.setProperty('--my', (e.clientY - b.top) + 'px');
        }, {passive: true});
        document.addEventListener('click', function (e) {
            var b = e.target.closest && e.target.closest('.sskk-btn, .sskk-qtyctl button, .sskk-fab button');
            if (!b) { return; }
            var r = b.getBoundingClientRect(), s = Math.max(r.width, r.height), d = document.createElement('span');
            d.className = 'sskk-ripple';
            d.style.cssText = 'width:' + s + 'px;height:' + s + 'px;left:' + (e.clientX - r.left - s / 2) + 'px;top:' + (e.clientY - r.top - s / 2) + 'px';
            b.appendChild(d);
            setTimeout(function () { d.remove(); }, 650);
        });
        var hero = document.querySelector('.sskk-hero');
        if (hero) {
            hero.addEventListener('mousemove', function (e) {
                var r = hero.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
                hero.querySelectorAll('[data-depth]').forEach(function (el) {
                    var d = parseFloat(el.dataset.depth);
                    el.style.translate = (x * d) + 'px ' + (y * d) + 'px';
                });
            });
            for (var k = 0; k < 14; k++) {
                var pt = document.createElement('i');
                pt.className = 'sskk-particle';
                pt.textContent = ['✦', '·', '✧', '❀'][k % 4];
                pt.style.cssText = 'left:' + (Math.random() * 100) + '%;animation-delay:' + (-Math.random() * 12) + 's;animation-duration:' +
                    (9 + Math.random() * 8) + 's;font-size:' + (10 + Math.random() * 14) + 'px';
                hero.appendChild(pt);
            }
        }

        /* staff login modal */
        var lm = $('#sskk-login'), lform = $('#sskk-login-form'), lerr = $('#sskk-login-error');
        function openLogin() {
            lm.hidden = false;
            lerr.hidden = true;
            document.body.classList.add('sskk-noscroll');
            setTimeout(function () { $('#sskk-login-user').focus(); }, 80);
        }
        function closeLogin() {
            lm.hidden = true;
            document.body.classList.remove('sskk-noscroll');
            lform.reset();
        }
        $('#sskk-logo-btn').addEventListener('click', openLogin);
        var topLogin = $('#sskk-login-top');          // NEW: top Login button
        if (topLogin) { topLogin.addEventListener('click', openLogin); }
        lm.addEventListener('click', function (e) { if (e.target.dataset && e.target.dataset.close) { closeLogin(); } });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !lm.hidden) { closeLogin(); } });
        $('#sskk-showpass').addEventListener('click', function () {
            var i = $('#sskk-login-pass');
            i.type = (i.type === 'password') ? 'text' : 'password';
            this.textContent = (i.type === 'password') ? '👁' : '🙈';
        });
        lform.addEventListener('submit', function (e) {
            e.preventDefault();
            var btn = $('#sskk-login-btn');
            lerr.hidden = true;
            btn.disabled = true;
            btn.textContent = 'Signing in…';
            rpc('/sskk/admin/login', {login: $('#sskk-login-user').value, password: $('#sskk-login-pass').value}).then(function (r) {
                if (!r || !r.ok) { throw new Error((r && r.error) || 'Login failed.'); }
                btn.textContent = '✓ Welcome! Opening backend…';
                window.location.href = r.redirect;
            }).catch(function (err) {
                lerr.textContent = err.message;
                lerr.hidden = false;
                btn.disabled = false;
                btn.textContent = 'Login ➔';
                lform.classList.remove('shake');
                void lform.offsetWidth;
                lform.classList.add('shake');
            });
        });

        $('#sskk-search').addEventListener('input', filterRows);
        $('#sskk-only-sel').addEventListener('change', filterRows);
        $('#sskk-cta').addEventListener('click', function () { $('#sskk-menu').scrollIntoView({behavior: 'smooth', block: 'start'}); });
        var sbar = $('#sskk-scrollbar');
        window.addEventListener('scroll', function () {
            var h = document.documentElement;
            sbar.style.width = (h.scrollTop / ((h.scrollHeight - h.clientHeight) || 1) * 100) + '%';
        }, {passive: true});

        $('#sskk-pill').addEventListener('click', goCart);
        $('#sskk-fab-go').addEventListener('click', goCart);
        recalc();
    });
})();