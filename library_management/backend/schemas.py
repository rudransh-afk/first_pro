from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, ConfigDict


# ---------- Book ----------
class BookBase(BaseModel):
    title: str
    author: str
    isbn: str
    quantity: int = 1


class BookCreate(BookBase):
    pass


class BookUpdate(BaseModel):
    title: Optional[str] = None
    author: Optional[str] = None
    isbn: Optional[str] = None
    quantity: Optional[int] = None


class BookOut(BookBase):
    model_config = ConfigDict(from_attributes=True)
    id: int
    available_quantity: int


# ---------- Member ----------
class MemberBase(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None


class MemberCreate(MemberBase):
    pass


class MemberUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None


class MemberOut(MemberBase):
    model_config = ConfigDict(from_attributes=True)
    id: int


# ---------- Loan ----------
class CheckoutRequest(BaseModel):
    book_id: int
    member_id: int
    days: int = 14


class LoanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    book_id: int
    member_id: int
    checkout_date: datetime
    due_date: Optional[datetime] = None
    return_date: Optional[datetime] = None
    returned: bool
    book_title: Optional[str] = None
    member_name: Optional[str] = None
