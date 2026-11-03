import re
import secrets
from urllib.parse import quote

from odoo import fields, http
from odoo.http import request
from odoo.tools import consteq

STEPS = ['placed', 'preparing', 'out_for_delivery', 'delivered']
PHONE_RE = re.compile(r'^\d{10}$')


class SskkKitchenController(http.Controller):

    # ------------------------------------------------------------ helpers
    def _icp(self, key, default=''):
        return request.env['ir.config_parameter'].sudo().get_param(key, default)

    def _settings(self):
        return {
            'tagline': self._icp('sskk.tagline'),
            'address': self._icp('sskk.address'),
            'phone': self._icp('sskk.phone'),
            'gst': float(self._icp('sskk.gst_rate', '5')),
            'delivery': float(self._icp('sskk.delivery_charge', '40')),
        }

    def _get_order(self, ref, token):
        Order = request.env['sskk.order'].sudo()
        order = Order.search([('name', '=', ref or '')], limit=1)
        if not order or not token or not consteq(order.access_token or '', token):
            return Order
        return order

    def _upi_uri(self, order):
        pa = self._icp('sskk.upi_id')
        pn = quote(self._icp('sskk.payee_name', 'Sri Sri Kameshwari Kitchen'))
        return 'upi://pay?pa=%s&pn=%s&am=%.2f&cu=INR&tn=%s' % (
            pa, pn, order.grand_total, quote('Order ' + order.name))

    def _demo_advance(self, order):
        """Demo mode: auto-move Placed -> Delivered so the stepper can be seen
        without kitchen staff. Disable with sskk.demo_mode = 0."""
        if order.payment_status != 'success' or not order.paid_date:
            return
        if self._icp('sskk.demo_mode', '1') != '1':
            return
        step = max(float(self._icp('sskk.demo_step_seconds', '8')), 1.0)
        elapsed = (fields.Datetime.now() - order.paid_date).total_seconds()
        target = STEPS[min(int(elapsed // step), len(STEPS) - 1)]
        if order.order_status in STEPS and STEPS.index(target) > STEPS.index(order.order_status):
            order.order_status = target

    # --------------------------------------------------------------- page
    @http.route(['/sskk', '/sskk-kitchen'], type='http', auth='public', website=True, sitemap=True)
    def sskk_page(self, **kw):
        items = request.env['sskk.menu.item'].sudo().search([])
        columns = [
            items.filtered(lambda i: i.column == 'column_1'),
            items.filtered(lambda i: i.column == 'column_2'),
        ]
        return request.render('sskk_kitchen.sskk_page', {
            'columns': columns,
            'settings': self._settings(),
        })

    # ------------------------------------------------- REST-style JSON API
    @http.route('/sskk/api/menu', type='http', auth='public', methods=['GET'], csrf=False)
    def api_menu(self, **kw):
        items = request.env['sskk.menu.item'].sudo().search([])
        return request.make_json_response([i.to_schema() for i in items])

    @http.route('/sskk/api/order/<string:ref>', type='http', auth='public', methods=['GET'], csrf=False)
    def api_order(self, ref, token=None, **kw):
        order = self._get_order(ref, token)
        if not order:
            return request.make_json_response({'error': 'Order not found'}, status=404)
        return request.make_json_response(order.to_payload())

    # ------------------------------------------------ order flow endpoints
    @http.route('/sskk/order/create', type='json', auth='public', website=True)
    def order_create(self, name='', phone='', address='', items=None, **kw):
        name = (name or '').strip()
        phone = (phone or '').strip()
        address = (address or '').strip()
        if not name or not address:
            return {'ok': False, 'error': 'Please enter your name and delivery address.'}
        if not PHONE_RE.match(phone):
            return {'ok': False, 'error': 'Phone number must be exactly 10 digits.'}
        if not items:
            return {'ok': False, 'error': 'Your cart is empty.'}

        gst = float(self._icp('sskk.gst_rate', '5'))
        delivery = float(self._icp('sskk.delivery_charge', '40'))
        Menu = request.env['sskk.menu.item'].sudo()

        lines, sub_total = [], 0.0
        for it in items:
            try:
                item = Menu.browse(int(it.get('id'))).exists()
                qty = int(it.get('qty'))
            except (TypeError, ValueError):
                return {'ok': False, 'error': 'Invalid cart data.'}
            if not item or not item.active or qty <= 0:
                continue
            if qty < item.min_qty:
                return {'ok': False, 'error': '%s requires a minimum quantity of %d.' % (item.name, item.min_qty)}
            total = round(item.price * qty, 2)
            sub_total += total
            lines.append((0, 0, {
                'item_id': item.id,
                'item_code': item.code or 'ITEM_%02d' % item.id,
                'name': item.name, 'price': item.price,
                'order_qty': qty, 'total': total,
            }))
        if not lines:
            return {'ok': False, 'error': 'Your cart is empty.'}

        tax = round(sub_total * gst / 100.0, 2)
        order = request.env['sskk.order'].sudo().create({
            'customer_name': name, 'customer_phone': phone, 'customer_address': address,
            'line_ids': lines,
            'sub_total': round(sub_total, 2), 'tax_amount': tax,
            'delivery_charge': delivery,
            'grand_total': round(sub_total + tax + delivery, 2),
            'access_token': secrets.token_urlsafe(16),
        })
        uri = self._upi_uri(order)
        return {
            'ok': True,
            'order_id': order.name,
            'token': order.access_token,
            'grand_total': order.grand_total,
            'upi_uri': uri,
            'qr_url': 'https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=' + quote(uri, safe=''),
        }

    @http.route('/sskk/order/pay', type='json', auth='public', website=True)
    def order_pay(self, order=None, token=None, **kw):
        rec = self._get_order(order, token)
        if not rec:
            return {'ok': False, 'error': 'Order not found.'}
        # NOTE: this trusts the customer's "I have completed the payment" click.
        # For production, confirm via your UPI/payment-gateway webhook or let
        # staff press "Confirm Payment" in the backend.
        if rec.payment_status != 'success':
            rec.action_confirm_payment()
        return {'ok': True, 'order_id': rec.name, 'status': rec.order_status}

    @http.route('/sskk/order/status', type='json', auth='public', website=True)
    def order_status(self, order=None, token=None, **kw):
        rec = self._get_order(order, token)
        if not rec:
            return {'ok': False, 'error': 'Order not found.'}
        self._demo_advance(rec)
        return {'ok': True, 'status': rec.order_status, 'feedback_done': bool(rec.rating)}

    @http.route('/sskk/order/feedback', type='json', auth='public', website=True)
    def order_feedback(self, order=None, token=None, rating=5, comments='', **kw):
        rec = self._get_order(order, token)
        if not rec:
            return {'ok': False, 'error': 'Order not found.'}
        if rec.order_status != 'delivered':
            return {'ok': False, 'error': 'Feedback opens once the order is delivered.'}
        try:
            rating = int(rating)
        except (TypeError, ValueError):
            rating = 0
        if rating < 1 or rating > 5:
            return {'ok': False, 'error': 'Please choose a rating from 1 to 5.'}
        rec.write({
            'rating': str(rating),
            'comments': (comments or '').strip()[:1000],
            'feedback_date': fields.Datetime.now(),
        })
        return {'ok': True}
