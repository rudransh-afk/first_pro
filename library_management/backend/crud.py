from datetime import datetime, timedelta

from fastapi import HTTPException
from sqlalchemy.orm import Session

import models
import schemas


# ---------- Books ----------
def get_books(db: Session, search: str | None = None):
    query = db.query(models.Book)
    if search:
        like = f"%{search}%"
        query = query.filter(
            (models.Book.title.ilike(like)) | (models.Book.author.ilike(like))
        )
    return query.order_by(models.Book.id.desc()).all()


def get_book(db: Session, book_id: int) -> models.Book:
    book = db.query(models.Book).filter(models.Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


def create_book(db: Session, book: schemas.BookCreate) -> models.Book:
    existing = db.query(models.Book).filter(models.Book.isbn == book.isbn).first()
    if existing:
        raise HTTPException(status_code=400, detail="A book with this ISBN already exists")
    db_book = models.Book(
        title=book.title,
        author=book.author,
        isbn=book.isbn,
        quantity=book.quantity,
        available_quantity=book.quantity,
    )
    db.add(db_book)
    db.commit()
    db.refresh(db_book)
    return db_book


def update_book(db: Session, book_id: int, book: schemas.BookUpdate) -> models.Book:
    db_book = get_book(db, book_id)
    data = book.model_dump(exclude_unset=True)

    if "quantity" in data:
        diff = data["quantity"] - db_book.quantity
        new_available = db_book.available_quantity + diff
        if new_available < 0:
            raise HTTPException(
                status_code=400,
                detail="Cannot reduce quantity below number of copies currently on loan",
            )
        db_book.available_quantity = new_available

    for field, value in data.items():
        setattr(db_book, field, value)

    db.commit()
    db.refresh(db_book)
    return db_book


def delete_book(db: Session, book_id: int):
    db_book = get_book(db, book_id)
    active_loans = (
        db.query(models.Loan)
        .filter(models.Loan.book_id == book_id, models.Loan.returned == False)  # noqa: E712
        .count()
    )
    if active_loans > 0:
        raise HTTPException(
            status_code=400, detail="Cannot delete a book that is currently checked out"
        )
    db.delete(db_book)
    db.commit()


# ---------- Members ----------
def get_members(db: Session, search: str | None = None):
    query = db.query(models.Member)
    if search:
        like = f"%{search}%"
        query = query.filter(
            (models.Member.name.ilike(like)) | (models.Member.email.ilike(like))
        )
    return query.order_by(models.Member.id.desc()).all()


def get_member(db: Session, member_id: int) -> models.Member:
    member = db.query(models.Member).filter(models.Member.id == member_id).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    return member


def create_member(db: Session, member: schemas.MemberCreate) -> models.Member:
    existing = db.query(models.Member).filter(models.Member.email == member.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="A member with this email already exists")
    db_member = models.Member(**member.model_dump())
    db.add(db_member)
    db.commit()
    db.refresh(db_member)
    return db_member


def update_member(db: Session, member_id: int, member: schemas.MemberUpdate) -> models.Member:
    db_member = get_member(db, member_id)
    for field, value in member.model_dump(exclude_unset=True).items():
        setattr(db_member, field, value)
    db.commit()
    db.refresh(db_member)
    return db_member


def delete_member(db: Session, member_id: int):
    db_member = get_member(db, member_id)
    active_loans = (
        db.query(models.Loan)
        .filter(models.Loan.member_id == member_id, models.Loan.returned == False)  # noqa: E712
        .count()
    )
    if active_loans > 0:
        raise HTTPException(
            status_code=400, detail="Cannot delete a member with books currently checked out"
        )
    db.delete(db_member)
    db.commit()


# ---------- Loans ----------
def _to_loan_out(loan: models.Loan) -> schemas.LoanOut:
    return schemas.LoanOut(
        id=loan.id,
        book_id=loan.book_id,
        member_id=loan.member_id,
        checkout_date=loan.checkout_date,
        due_date=loan.due_date,
        return_date=loan.return_date,
        returned=loan.returned,
        book_title=loan.book.title if loan.book else None,
        member_name=loan.member.name if loan.member else None,
    )


def get_loans(db: Session, only_active: bool = False):
    query = db.query(models.Loan)
    if only_active:
        query = query.filter(models.Loan.returned == False)  # noqa: E712
    loans = query.order_by(models.Loan.id.desc()).all()
    return [_to_loan_out(loan) for loan in loans]


def checkout_book(db: Session, request: schemas.CheckoutRequest) -> schemas.LoanOut:
    book = get_book(db, request.book_id)
    get_member(db, request.member_id)  # ensures member exists

    if book.available_quantity < 1:
        raise HTTPException(status_code=400, detail="No copies of this book are available")

    book.available_quantity -= 1
    loan = models.Loan(
        book_id=request.book_id,
        member_id=request.member_id,
        checkout_date=datetime.utcnow(),
        due_date=datetime.utcnow() + timedelta(days=request.days),
        returned=False,
    )
    db.add(loan)
    db.commit()
    db.refresh(loan)
    return _to_loan_out(loan)


def return_book(db: Session, loan_id: int) -> schemas.LoanOut:
    loan = db.query(models.Loan).filter(models.Loan.id == loan_id).first()
    if not loan:
        raise HTTPException(status_code=404, detail="Loan not found")
    if loan.returned:
        raise HTTPException(status_code=400, detail="This loan was already returned")

    loan.returned = True
    loan.return_date = datetime.utcnow()
    loan.book.available_quantity += 1

    db.commit()
    db.refresh(loan)
    return _to_loan_out(loan)
