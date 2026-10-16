import os

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

import crud
import models
import schemas
from database import Base, SessionLocal, engine, get_db

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Library Management System", version="1.0.0")

# Allow the frontend to call the API even if served from a different origin
# during local development (e.g. opening index.html directly).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api"


# ---------- Health ----------
@app.get(f"{API_PREFIX}/health")
def health_check():
    return {"status": "ok"}


# ---------- Books ----------
@app.get(f"{API_PREFIX}/books", response_model=list[schemas.BookOut])
def list_books(search: str | None = None, db: Session = Depends(get_db)):
    return crud.get_books(db, search)


@app.get(f"{API_PREFIX}/books/{{book_id}}", response_model=schemas.BookOut)
def get_book(book_id: int, db: Session = Depends(get_db)):
    return crud.get_book(db, book_id)


@app.post(f"{API_PREFIX}/books", response_model=schemas.BookOut, status_code=201)
def create_book(book: schemas.BookCreate, db: Session = Depends(get_db)):
    return crud.create_book(db, book)


@app.put(f"{API_PREFIX}/books/{{book_id}}", response_model=schemas.BookOut)
def update_book(book_id: int, book: schemas.BookUpdate, db: Session = Depends(get_db)):
    return crud.update_book(db, book_id, book)


@app.delete(f"{API_PREFIX}/books/{{book_id}}", status_code=204)
def delete_book(book_id: int, db: Session = Depends(get_db)):
    crud.delete_book(db, book_id)


# ---------- Members ----------
@app.get(f"{API_PREFIX}/members", response_model=list[schemas.MemberOut])
def list_members(search: str | None = None, db: Session = Depends(get_db)):
    return crud.get_members(db, search)


@app.get(f"{API_PREFIX}/members/{{member_id}}", response_model=schemas.MemberOut)
def get_member(member_id: int, db: Session = Depends(get_db)):
    return crud.get_member(db, member_id)


@app.post(f"{API_PREFIX}/members", response_model=schemas.MemberOut, status_code=201)
def create_member(member: schemas.MemberCreate, db: Session = Depends(get_db)):
    return crud.create_member(db, member)


@app.put(f"{API_PREFIX}/members/{{member_id}}", response_model=schemas.MemberOut)
def update_member(member_id: int, member: schemas.MemberUpdate, db: Session = Depends(get_db)):
    return crud.update_member(db, member_id, member)


@app.delete(f"{API_PREFIX}/members/{{member_id}}", status_code=204)
def delete_member(member_id: int, db: Session = Depends(get_db)):
    crud.delete_member(db, member_id)


# ---------- Loans (checkout / return) ----------
@app.get(f"{API_PREFIX}/loans", response_model=list[schemas.LoanOut])
def list_loans(active_only: bool = False, db: Session = Depends(get_db)):
    return crud.get_loans(db, only_active=active_only)


@app.post(f"{API_PREFIX}/loans/checkout", response_model=schemas.LoanOut, status_code=201)
def checkout_book(request: schemas.CheckoutRequest, db: Session = Depends(get_db)):
    return crud.checkout_book(db, request)


@app.post(f"{API_PREFIX}/loans/{{loan_id}}/return", response_model=schemas.LoanOut)
def return_book(loan_id: int, db: Session = Depends(get_db)):
    return crud.return_book(db, loan_id)


# ---------- Serve the plain HTML/CSS/JS frontend ----------
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
if os.path.isdir(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
