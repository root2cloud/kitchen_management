{
    'name': 'Sri Sri Kameshwari Kitchen - Online Ordering',
    'version': '18.0.1.0.0',
    'category': 'Website',
    'summary': 'Single-page progressive food ordering with UPI QR payment, live tracking and feedback',
    'description': """
Sri Sri Kameshwari Kitchen (SSK) - Single Page E-Commerce
=========================================================
Implements the developer handoff document: sticky header, 2-column menu with
minimum-quantity logic, live cart (5% GST + Rs.40 delivery), customer form,
order summary, dynamic UPI QR payment, live order tracking and feedback.
    """,
    'author': 'Sri Sri Kameshwari Kitchen',
    'license': 'LGPL-3',
    'depends': ['website'],
    'data': [
        'security/ir.model.access.csv',
        'data/sskk_data.xml',
        'views/sskk_backend_views.xml',
        'views/sskk_templates.xml',
    ],
    'assets': {
        'web.assets_frontend': [
            'sskk_kitchen/static/src/css/sskk.css',
            'sskk_kitchen/static/src/js/sskk.js',
        ],
    },
    'application': True,
    'installable': True,
}
