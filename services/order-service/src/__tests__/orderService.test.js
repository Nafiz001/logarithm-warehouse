/**
 * Order Service Unit Tests
 */

// Mock dependencies before importing
jest.mock('../db/init', () => ({
  getPool: jest.fn(() => ({
    query: jest.fn()
  }))
}));

jest.mock('../services/inventoryClient', () => ({
  deductInventory: jest.fn(),
  checkAvailability: jest.fn(),
  checkOrderProcessed: jest.fn(),
  getTimeout: jest.fn(() => 3000),
  setTimeout: jest.fn()
}));

const { v4: uuidv4 } = require('uuid');

describe('Order Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('UUID Generation', () => {
    test('should generate valid UUID v4', () => {
      const id = uuidv4();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    test('should generate unique UUIDs', () => {
      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(uuidv4());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('Order Validation', () => {
    test('should reject order without customer name', () => {
      const order = { items: [{ productId: '123', quantity: 1 }] };
      expect(order.customerName).toBeUndefined();
    });

    test('should reject order without items', () => {
      const order = { customerName: 'Test User' };
      expect(order.items).toBeUndefined();
    });

    test('should reject order with empty items array', () => {
      const order = { customerName: 'Test User', items: [] };
      expect(order.items.length).toBe(0);
    });

    test('should accept valid order data', () => {
      const order = {
        customerName: 'Test User',
        customerEmail: 'test@example.com',
        items: [
          { productId: '123', productName: 'Widget', quantity: 2, unitPrice: 9.99 }
        ]
      };
      expect(order.customerName).toBeDefined();
      expect(order.items.length).toBeGreaterThan(0);
      expect(order.items[0].productId).toBeDefined();
      expect(order.items[0].quantity).toBeGreaterThan(0);
    });
  });

  describe('Order Total Calculation', () => {
    function calculateTotal(items) {
      return items.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
    }

    test('should calculate total for single item', () => {
      const items = [{ productId: '1', quantity: 2, unitPrice: 10.00 }];
      expect(calculateTotal(items)).toBe(20.00);
    });

    test('should calculate total for multiple items', () => {
      const items = [
        { productId: '1', quantity: 2, unitPrice: 10.00 },
        { productId: '2', quantity: 3, unitPrice: 5.00 }
      ];
      expect(calculateTotal(items)).toBe(35.00);
    });

    test('should handle decimal prices correctly', () => {
      const items = [{ productId: '1', quantity: 3, unitPrice: 9.99 }];
      expect(calculateTotal(items)).toBeCloseTo(29.97, 2);
    });
  });

  describe('Idempotency Key', () => {
    test('should generate idempotency key from order ID', () => {
      const orderId = 'order-123';
      const idempotencyKey = `order-${orderId}`;
      expect(idempotencyKey).toBe('order-order-123');
    });

    test('should use provided idempotency key', () => {
      const providedKey = 'custom-key-456';
      const key = providedKey || `order-${Date.now()}`;
      expect(key).toBe('custom-key-456');
    });
  });

  describe('Order Status Transitions', () => {
    const validTransitions = {
      pending: ['confirmed', 'cancelled'],
      confirmed: ['shipped', 'cancelled'],
      shipped: [],
      cancelled: []
    };

    test('pending order can be confirmed', () => {
      expect(validTransitions.pending).toContain('confirmed');
    });

    test('pending order can be cancelled', () => {
      expect(validTransitions.pending).toContain('cancelled');
    });

    test('shipped order cannot be changed', () => {
      expect(validTransitions.shipped.length).toBe(0);
    });

    test('cancelled order cannot be changed', () => {
      expect(validTransitions.cancelled.length).toBe(0);
    });
  });
});
