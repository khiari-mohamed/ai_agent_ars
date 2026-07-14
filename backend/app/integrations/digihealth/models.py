from __future__ import annotations

from pydantic import BaseModel, Field


class AssureDigiHealth(BaseModel):
    id: str
    cin: str
    numero_assure: str
    nom: str
    prenom: str
    date_naissance: str
    email: str | None = None
    telephone: str | None = None
    statut_couverture: str
    caisse: str


class ReclamationDigiHealth(BaseModel):
    id: str
    date: str
    motif: str
    statut: str
    montant: float | None = None


class RemboursementDigiHealth(BaseModel):
    id: str
    date: str
    montant: float
    statut: str
    prestataire: str | None = None


class EligibiliteDigiHealth(BaseModel):
    eligible: bool
    plafond: float | None = None
    exclusions: list[str] = Field(default_factory=list)
    validite: str | None = None