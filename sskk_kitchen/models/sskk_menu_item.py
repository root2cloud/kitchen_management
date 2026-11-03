from odoo import api, fields, models
from odoo.exceptions import ValidationError


class SskkMenuItem(models.Model):
    _name = 'sskk.menu.item'
    _description = 'SSKK Menu Item'
    _order = 'sequence, id'

    name = fields.Char(string='Item Name', required=True)
    code = fields.Char(string='Item Code', help='External ID used in the API, e.g. ITEM_01')
    column = fields.Selection(
        [('column_1', 'Column 1'), ('column_2', 'Column 2')],
        string='Menu Column', default='column_1', required=True)
    price = fields.Float(string='Unit Price (₹)', digits=(16, 2), required=True)
    min_qty = fields.Integer(string='Minimum Qty', default=1, required=True)
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)

    @api.constrains('price', 'min_qty')
    def _check_price_min_qty(self):
        for rec in self:
            if rec.price < 0:
                raise ValidationError("Price cannot be negative.")
            if rec.min_qty < 1:
                raise ValidationError("Minimum quantity must be at least 1.")

    def to_schema(self):
        """MenuItem schema from the handoff document (LLD section 3)."""
        self.ensure_one()
        return {
            'id': self.code or 'ITEM_%02d' % self.id,
            'name': self.name,
            'category': 'Column_%s' % self.column[-1],
            'price': self.price,
            'minQty': self.min_qty,
        }
