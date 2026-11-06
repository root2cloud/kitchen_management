from odoo import api, fields, models
from odoo.exceptions import ValidationError


class SskkMenuItem(models.Model):
    _name = 'sskk.menu.item'
    _description = 'SSKK Menu Item'
    _order = 'sequence, id'

    # ---- required fields (shown with a coloured underline in the form) ----
    name = fields.Char(string='Item Name', required=True)
    price = fields.Float(string='Unit Price (₹)', digits=(16, 2), required=True)
    min_qty = fields.Integer(string='Minimum Qty', default=1, required=True,
                             help='Clicking + on the website starts at this quantity.')
    column = fields.Selection(
        [('column_1', 'Column 1'), ('column_2', 'Column 2')],
        string='Menu Column', default='column_1', required=True,
        help='Which of the two website menu columns the dish is shown in.')

    # ---- optional ----
    icon = fields.Char(string='Emoji Icon', help='Shown on the website when no photo is uploaded, e.g. 🍛')
    image = fields.Image(string='Photo', max_width=1024, max_height=1024)
    image_512 = fields.Image(related='image', max_width=512, max_height=512, store=True)
    has_image = fields.Boolean(compute='_compute_has_image', store=True)
    description = fields.Char(string='Short Description')

    # ---- website / system ----
    code = fields.Char(string='Item Code', readonly=True, copy=False,
                       help='Generated automatically, e.g. ITEM_04')
    is_published = fields.Boolean(string='Show on Website', default=True)
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)

    @api.depends('image')
    def _compute_has_image(self):
        for rec in self:
            rec.has_image = bool(rec.image)

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if not vals.get('code'):
                vals['code'] = self.env['ir.sequence'].sudo().next_by_code('sskk.menu.item') or False
        records = super().create(vals_list)
        for rec in records.filtered(lambda r: not r.code):
            rec.code = 'ITEM_%02d' % rec.id
        return records

    @api.constrains('price', 'min_qty')
    def _check_price_min_qty(self):
        for rec in self:
            if rec.price <= 0:
                raise ValidationError("Unit price must be greater than 0.")
            if rec.min_qty < 1:
                raise ValidationError("Minimum quantity must be at least 1.")

    @api.constrains('name')
    def _check_unique_name(self):
        for rec in self:
            dup = self.search([('id', '!=', rec.id), ('name', '=ilike', (rec.name or '').strip())], limit=1)
            if dup:
                raise ValidationError("A menu item named '%s' already exists." % rec.name)

    def action_view_website(self):
        return {'type': 'ir.actions.act_url', 'url': '/sskk-kitchen', 'target': 'new'}

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
