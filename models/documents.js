const mongoose = require('mongoose')
const Schema = mongoose.Schema
const documentSchema = new Schema({
    user_id: String,
    document_category: String,
    document: String,
    signed_document: String,
    request_id: String,
    requesting_token: String,
    ref_number: String,
    qrcode: String,
    signerCert: String,
    issuerCert: String,
    time: String,
    flag: String

}, { timestamps: true, versionKey: false })
const DocumentModel = mongoose.model('documents', documentSchema)
module.exports = DocumentModel