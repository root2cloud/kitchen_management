import secrets

from odoo import api, fields, models


class SskkOrder(models.Model):
    _name = 'sskk.order'
    _description = 'SSKK Customer Order'
    _order = 'id desc'

    name = fields.Char(string='Order ID', readonly=True, copy=False, default='New')
    access_token = fields.Char(copy=False, default=lambda self: secrets.token_urlsafe(16))

    customer_name = fields.Char(string='Customer Name', required=True)
    customer_phone = fields.Char(string='Phone (10 digits)', required=True)
    customer_address = fields.Text(string='Delivery Address', required=True)

    line_ids = fields.One2many('sskk.order.line', 'order_id', string='Items')
    sub_total = fields.Float(digits=(16, 2))
    tax_amount = fields.Float(string='Tax (GST)', digits=(16, 2))
    delivery_charge = fields.Float(digits=(16, 2))
    grand_total = fields.Float(string='Total Payable', digits=(16, 2))

    payment_status = fields.Selection(
        [('pending', 'Pending'), ('success', 'Success'), ('failed', 'Failed')],
        default='pending', required=True)
    paid_date = fields.Datetime()
    order_status = fields.Selection(
        [('awaiting', 'Awaiting Payment'),
         ('placed', 'Placed'),
         ('preparing', 'Preparing'),
         ('out_for_delivery', 'Out for Delivery'),
         ('delivered', 'Delivered')],
        default='awaiting', required=True)

    rating = fields.Selection(
        [('1', '1 - Poor'), ('2', '2 - Fair'), ('3', '3 - Good'),
         ('4', '4 - Very Good'), ('5', '5 - Excellent')], string='Rating')
    comments = fields.Text(string='Feedback Comments')
    feedback_date = fields.Datetime()

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if vals.get('name', 'New') == 'New':
                vals['name'] = self.env['ir.sequence'].sudo().next_by_code('sskk.order') or 'New'
        return super().create(vals_list)

    # ---- status actions (kitchen staff buttons) ----
    def action_confirm_payment(self):
        for order in self:
            vals = {'payment_status': 'success', 'paid_date': fields.Datetime.now()}
            if order.order_status == 'awaiting':
                vals['order_status'] = 'placed'
            order.write(vals)

    def action_preparing(self):
        self.write({'order_status': 'preparing'})

    def action_out_for_delivery(self):
        self.write({'order_status': 'out_for_delivery'})

    def action_delivered(self):
        self.write({'order_status': 'delivered'})

    def to_payload(self):
        """Order Submission schema from the handoff document (LLD section 3)."""
        self.ensure_one()
        return {
            'orderId': self.name,
            'customer': {
                'name': self.customer_name,
                'phone': self.customer_phone,
                'address': self.customer_address,
            },
            'items': [{
                'id': l.item_code, 'name': l.name, 'price': l.price,
                'orderQty': l.order_qty, 'total': l.total,
            } for l in self.line_ids],
            'pricing': {
                'subTotal': self.sub_total,
                'taxAmount': self.tax_amount,
                'deliveryCharge': self.delivery_charge,
                'grandTotal': self.grand_total,
            },
            'paymentStatus': (self.payment_status or '').upper(),
            'orderStatus': (self.order_status or '').upper(),
        }


class SskkOrderLine(models.Model):
    _name = 'sskk.order.line'
    _description = 'SSKK Order Line'

    order_id = fields.Many2one('sskk.order', required=True, ondelete='cascade')
    item_id = fields.Many2one('sskk.menu.item', ondelete='set null')
    item_code = fields.Char(string='Item Code')
    name = fields.Char(string='Item', required=True)
    price = fields.Float(digits=(16, 2))
    order_qty = fields.Integer(string='Qty')
    total = fields.Float(digits=(16, 2))
