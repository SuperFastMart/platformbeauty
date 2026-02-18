const jwt = require('jsonwebtoken');
const { getOne } = require('../config/database');

const customerAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded.customerId) {
      return res.status(401).json({ error: 'Invalid customer token' });
    }

    // Verify customer exists and belongs to the correct tenant
    const customer = await getOne(
      'SELECT id, tenant_id, name, email, phone FROM customers WHERE id = $1',
      [decoded.customerId]
    );

    if (!customer) {
      return res.status(401).json({ error: 'Customer not found' });
    }

    // Verify tenant matches (req.tenantId set by resolveTenant middleware)
    if (req.tenantId && customer.tenant_id !== req.tenantId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    req.customer = {
      id: customer.id,
      tenantId: customer.tenant_id,
      email: customer.email,
      name: customer.name,
    };

    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = { customerAuth };
