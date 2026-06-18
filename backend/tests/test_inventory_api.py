"""Backend API tests for Inventory & Order Management."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"
ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def auth(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Auth ----------
class TestAuth:
    def test_login_success(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == ADMIN_EMAIL
        assert isinstance(data["access_token"], str) and len(data["access_token"]) > 20

    def test_login_invalid(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_me(self, auth):
        r = requests.get(f"{API}/auth/me", headers=auth)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL

    @pytest.mark.parametrize("path", ["/products", "/customers", "/orders", "/dashboard"])
    def test_unauth_returns_401(self, path):
        r = requests.get(f"{API}{path}")
        assert r.status_code in (401, 403), f"Expected 401/403 for {path}, got {r.status_code}"


# ---------- Dashboard ----------
class TestDashboard:
    def test_dashboard_totals(self, auth):
        r = requests.get(f"{API}/dashboard", headers=auth)
        assert r.status_code == 200
        d = r.json()
        for k in ("total_products", "total_customers", "total_orders", "total_revenue", "low_stock_products"):
            assert k in d
        assert d["total_products"] >= 6
        assert d["total_customers"] >= 3
        skus = {p["sku"] for p in d["low_stock_products"]}
        assert {"WC-006", "HB-004", "MN-003"}.issubset(skus)


# ---------- Products ----------
class TestProducts:
    def test_list_seeded(self, auth):
        r = requests.get(f"{API}/products", headers=auth)
        assert r.status_code == 200
        skus = {p["sku"] for p in r.json()}
        assert {"WM-001", "KB-002", "MN-003", "HB-004", "HP-005", "WC-006"}.issubset(skus)

    def test_create_duplicate_delete(self, auth):
        sku = f"TEST-{uuid.uuid4().hex[:8].upper()}"
        payload = {"name": "TEST_Widget", "sku": sku, "price": 12.5, "quantity": 5, "description": "test"}
        r = requests.post(f"{API}/products", json=payload, headers=auth)
        assert r.status_code == 201, r.text
        pid = r.json()["id"]
        assert r.json()["sku"] == sku

        # Verify GET persistence
        g = requests.get(f"{API}/products/{pid}", headers=auth)
        assert g.status_code == 200 and g.json()["name"] == "TEST_Widget"

        # Duplicate SKU
        dup = requests.post(f"{API}/products", json=payload, headers=auth)
        assert dup.status_code == 409

        # Edit
        u = requests.put(f"{API}/products/{pid}", json={"price": 19.99}, headers=auth)
        assert u.status_code == 200 and u.json()["price"] == 19.99

        # Delete
        d = requests.delete(f"{API}/products/{pid}", headers=auth)
        assert d.status_code == 204
        assert requests.get(f"{API}/products/{pid}", headers=auth).status_code == 404

    def test_negative_validation(self, auth):
        bad = {"name": "X", "sku": "NEGTEST-1", "price": -1, "quantity": 1}
        assert requests.post(f"{API}/products", json=bad, headers=auth).status_code == 422
        bad2 = {"name": "X", "sku": "NEGTEST-2", "price": 1, "quantity": -5}
        assert requests.post(f"{API}/products", json=bad2, headers=auth).status_code == 422


# ---------- Customers ----------
class TestCustomers:
    def test_list_seeded(self, auth):
        r = requests.get(f"{API}/customers", headers=auth)
        assert r.status_code == 200
        emails = {c["email"] for c in r.json()}
        assert {"ops@acme.com", "purchasing@globex.io", "orders@initech.co"}.issubset(emails)

    def test_create_duplicate_delete(self, auth):
        email = f"test_{uuid.uuid4().hex[:6]}@example.com"
        payload = {"full_name": "TEST_Customer", "email": email, "phone": "+1-555-0100", "address": "1 Test St"}
        r = requests.post(f"{API}/customers", json=payload, headers=auth)
        assert r.status_code == 201
        cid = r.json()["id"]

        dup = requests.post(f"{API}/customers", json=payload, headers=auth)
        assert dup.status_code == 409

        d = requests.delete(f"{API}/customers/{cid}", headers=auth)
        assert d.status_code == 204


# ---------- Orders ----------
class TestOrders:
    def test_order_lifecycle(self, auth):
        # Setup: create dedicated customer and product
        email = f"order_{uuid.uuid4().hex[:6]}@example.com"
        c = requests.post(f"{API}/customers", json={"full_name": "TEST_OrderCust", "email": email, "phone": "+1-555-1"}, headers=auth)
        assert c.status_code == 201
        cid = c.json()["id"]

        sku = f"ORD-{uuid.uuid4().hex[:6].upper()}"
        p = requests.post(f"{API}/products", json={"name": "TEST_OrderProd", "sku": sku, "price": 10.0, "quantity": 20}, headers=auth)
        assert p.status_code == 201
        pid = p.json()["id"]

        # Dashboard before
        before = requests.get(f"{API}/dashboard", headers=auth).json()

        # Create order
        order_payload = {"customer_id": cid, "items": [{"product_id": pid, "quantity": 3}]}
        o = requests.post(f"{API}/orders", json=order_payload, headers=auth)
        assert o.status_code == 201, o.text
        od = o.json()
        assert od["total_amount"] == 30.0
        assert len(od["items"]) == 1
        assert od["items"][0]["unit_price"] == 10.0
        assert od["items"][0]["line_total"] == 30.0
        oid = od["id"]

        # Stock deducted
        prod = requests.get(f"{API}/products/{pid}", headers=auth).json()
        assert prod["quantity"] == 17

        # Insufficient stock
        bad = requests.post(f"{API}/orders", json={"customer_id": cid, "items": [{"product_id": pid, "quantity": 9999}]}, headers=auth)
        assert bad.status_code == 400
        assert "stock" in bad.json()["detail"].lower() or "insufficient" in bad.json()["detail"].lower()

        # View order detail
        view = requests.get(f"{API}/orders/{oid}", headers=auth)
        assert view.status_code == 200
        assert view.json()["items"][0]["product_sku"] == sku

        # Dashboard updated
        after = requests.get(f"{API}/dashboard", headers=auth).json()
        assert after["total_orders"] == before["total_orders"] + 1
        assert round(after["total_revenue"] - before["total_revenue"], 2) == 30.0

        # Delete order restores stock
        d = requests.delete(f"{API}/orders/{oid}", headers=auth)
        assert d.status_code == 204
        prod2 = requests.get(f"{API}/products/{pid}", headers=auth).json()
        assert prod2["quantity"] == 20

        # Cleanup
        requests.delete(f"{API}/products/{pid}", headers=auth)
        requests.delete(f"{API}/customers/{cid}", headers=auth)
