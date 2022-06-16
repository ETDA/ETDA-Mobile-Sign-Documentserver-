const express = require('express')
const app = express()
const axios = require('axios')
const QRCode = require('qrcode')
const cors = require('cors')
const Document = require('./models/documents')
require('console-stamp')(console);

require('dotenv').config()

const mongoose = require('mongoose')
mongoose.connect(process.env.DB_HOST, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false
})

mongoose.connection.on('error', err => {
    console.error('MongoDB error', err)
})

app.use(express.json({ limit: '100mb' }), cors())
    //app.use(cors)

const ACCEPT = "accept";
const REJECT = "reject";


app.post('/api/v2/documents/signing_request', (req, res) => {
    var errorResp = new Object();
    var response = new Object();

    try {

        console.info('********** SIGNING REQUEST **********')

        if (req.body.document_category == null || req.body.document_category == '') {

            errorResp.status = REJECT
            errorResp.description = 'document_category Invalid'

            console.error(errorResp.description)

            res.status(400);
            res.send(errorResp);

        } else if (req.body.document == null || req.body.document == '') {
            errorResp.status = REJECT
            errorResp.description = 'Base64 document Invalid'

            console.error(errorResp.description)

            res.status(400);
            res.send(errorResp);
        } else {

            if (req.body.document_category == 'XML' || req.body.document_category == 'PDF') {

                console.info('document_category: ' + req.body.document_category)

                //curl to signing request
                var refNumber = Math.floor(100000 + Math.random() * 900000).toString()
                console.info('ref_number: ' + refNumber)

                console.info('Curl to : ' + process.env.Signing_Request_URL)
                axios
                    .post(process.env.Signing_Request_URL, {
                        user_id: req.body.user_id,
                        document_category: req.body.document_category,
                        ref_number: refNumber,
                        callback_url: { "hash": process.env.hash_url, "getsignature": process.env.getsignature_url }
                    }, {
                        headers: {
                            ClientID: process.env.ClientID,
                            Secret: process.env.Secret
                        }
                    })
                    .then(srq_res => {

                        if (srq_res.data.result == 'accept') {

                            console.info('Response status from ' + process.env.Signing_Request_URL + ': ' + srq_res.data.result)

                            var qr_data = srq_res.data.signing_endpoint + ';' + srq_res.data.request_id + ';' + srq_res.data.requesting_token + ';' + refNumber + ';'

                            QRCode.toDataURL(qr_data, function(err, qr) {

                                try {
                                    if (err) {
                                        throw err
                                    }

                                    console.info('Created Qr Code OK')
                                    console.info('request_id: ' + srq_res.data.request_id)

                                    var insert = new Object();
                                    insert.user_id = req.body.user_id
                                    insert.document_category = req.body.document_category
                                    insert.document = req.body.document
                                    insert.signed_document = null
                                    insert.request_id = srq_res.data.request_id
                                    insert.requesting_token = srq_res.data.requesting_token
                                    insert.ref_number = refNumber
                                    insert.qrcode = qr
                                    insert.signerCert = null
                                    insert.issuerCert = null
                                    insert.time = null
                                    insert.flag = null

                                    var document = new Document(insert)
                                    document.save()

                                    console.info('Save to DB OK')

                                    response.status = ACCEPT
                                    response.description = ''
                                    response.qrcode = qr

                                    console.info('Signing Request OK')

                                    res.status(200);
                                    res.send(response);



                                } catch (qrEx) {
                                    errorResp.status = REJECT
                                    errorResp.description = qrEx

                                    res.status(500);
                                    res.send(errorResp);

                                    console.error(errorResp.description)
                                }
                            })
                        } else {
                            errorResp.status = REJECT
                            errorResp.description = "{" + srq_res.data.result + "}" + " status from Signing Server: " + srq_res.data.description

                            console.error(errorResp.description)

                            res.status(200);
                            res.send(errorResp);
                        }
                    })
                    .catch(srq_res_error => {

                        errorResp.status = REJECT
                        errorResp.description = "Curl to Signing Server Exception: " + srq_res_error

                        console.error(errorResp.description)

                        res.status(500);
                        res.send(errorResp);

                    })
            } else {
                errorResp.status = REJECT
                errorResp.description = 'document_category Invalid'

                console.error(errorResp.description)

                res.status(400);
                res.send(errorResp);

            }
        }

    } catch (ex) {

        errorResp.status = REJECT
        errorResp.description = 'Unknown Exception ERROR: ' + ex

        console.error(errorResp.description)

        res.status(500);
        res.send(errorResp);
    }
})

app.post('/api/v2/documents/request_hash', (req, res) => {

    var errorResp = new Object();
    var response = new Object();

    try {

        console.info('********** REQUEST HASH **********')

        if (req.body.request_id == null || req.body.request_id == '') {

            errorResp.status = REJECT
            errorResp.description = 'request_id Invalid'

            console.error('request_id Invalid')

            res.status(400);
            res.send(errorResp);
        } else {

            console.info('request_id' + req.body.request_id)

            var query = Document.findOne({ 'request_id': req.body.request_id });

            query.select('id document_category document');

            query.exec(function(err, document) {

                try {
                    if (err) {
                        throw err
                    }

                    if (document == null) {
                        throw 'request_id Invalid'
                    }

                    console.info('document_category: ' + document.document_category)

                    if (document.document_category == 'XML') {

                        console.info('Curl to : ' + process.env.DigestDoc_URL_XML)

                        axios
                            .post(process.env.DigestDoc_URL_XML, {
                                inputFile: document.document,
                                digestMethod: process.env.digestMethod
                            })
                            .then(digest_res => {

                                if (digest_res.data.status == 'SUCCESS') {

                                    console.info('digestDoc status : ' + digest_res.data.status)

                                    response.result = ACCEPT
                                    response.description = ''
                                    response.document_hash = digest_res.data.digest
                                    response.xml_namespace = digest_res.data.namespace
                                    response.digest_method = process.env.digestMethod

                                    console.info('request_hash success')

                                    res.status(200);
                                    res.send(response);

                                } else {
                                    errorResp.status = REJECT
                                    errorResp.description = "{" + digest_res.data.status + "}" + " status from digest Doc: " + digest_res.data.description

                                    console.error(errorResp.description)

                                    res.status(200);
                                    res.send(errorResp);
                                }
                            })
                            .catch(digest_res_error => {

                                errorResp.status = REJECT
                                errorResp.description = "Curl to digest Doc Exception: " + digest_res_error

                                console.error(errorResp.description)

                                res.status(500);
                                res.send(errorResp);
                            })

                    } else if (document.document_category == 'PDF') {

                        if (req.body.signerCert == null || req.body.signerCert == '') {

                            errorResp.status = REJECT
                            errorResp.description = 'signerCert Invalid'

                            console.error('signerCert Invalid')

                            res.status(400);
                            res.send(errorResp);
                        }

                        if (req.body.issuerCert == null || req.body.issuerCert == '') {

                            errorResp.status = REJECT
                            errorResp.description = 'issuerCert Invalid'

                            console.error('issuerCert Invalid')

                            res.status(400);
                            res.send(errorResp);
                        }

                        console.info('Curl to : ' + process.env.DigestDoc_URL_PDF)

                        axios
                            .post(process.env.DigestDoc_URL_PDF, {
                                inputFile: document.document,
                            })
                            .then(digest_res => {

                                if (digest_res.data.status == 'SUCCESS') {

                                    console.info('digestDoc status : ' + digest_res.data.status)

                                    response.result = ACCEPT
                                    response.description = ''
                                    response.document_hash = digest_res.data.digest

                                    Document.findOneAndUpdate({ request_id: req.body.request_id }, {
                                        $set: {
                                            time: digest_res.data.time.toString(),
                                            signerCert: req.body.signerCert,
                                            issuerCert: req.body.issuerCert
                                        }
                                    }, { new: true }, (err, doc) => {
                                        try {
                                            if (err) {
                                                throw err
                                            }

                                            if (doc.time == null) {
                                                throw 'update time to DB Failed'
                                            }

                                            response.result = ACCEPT
                                            response.description = ''

                                            console.info('request_hash success')

                                            res.status(200);
                                            res.send(response);

                                        } catch (updateEx) {
                                            errorResp.status = REJECT
                                            errorResp.description = updateEx

                                            console.error(errorResp.description)

                                            res.status(500);
                                            res.send(errorResp);
                                        }
                                    });

                                } else {
                                    errorResp.status = REJECT
                                    errorResp.description = "{" + digest_res.data.status + "}" + " status from digest Doc: " + digest_res.data.description

                                    console.error(errorResp.description)

                                    res.status(200);
                                    res.send(errorResp);
                                }
                            })
                            .catch(digest_res_error => {

                                errorResp.status = REJECT
                                errorResp.description = "Curl to digest Doc Exception: " + digest_res_error

                                console.error(errorResp.description)

                                res.status(500);
                                res.send(errorResp);
                            })
                    }
                } catch (queryEx) {
                    errorResp.status = REJECT
                    errorResp.description = queryEx

                    console.error(errorResp.description)

                    res.status(500);
                    res.send(errorResp);
                }
            })
        }
    } catch (ex) {

        errorResp.status = REJECT
        errorResp.description = 'Unknown Exception ERROR: ' + ex

        console.error(errorResp.description)

        res.status(500);
        res.send(errorResp);
    }
})

app.post('/api/v2/documents/getsignature_value', (req, res) => {

    var errorResp = new Object();
    var response = new Object();
    var attached_URL = '';

    try {

        console.info('********** GET SIGNATURE VALUE **********')

        if (req.body.request_id == null || req.body.request_id == '') {

            errorResp.status = REJECT
            errorResp.description = 'request_id Invalid'

            console.error(errorResp.description)

            res.status(400);
            res.send(errorResp);
        } else if (req.body.signature == null || req.body.signature == '') {

            errorResp.status = REJECT
            errorResp.description = 'signature Invalid'

            console.error(errorResp.description)

            res.status(400);
            res.send(errorResp);

        } else {

            console.info('request_id: ' + req.body.request_id)

            var query = Document.findOne({ 'request_id': req.body.request_id });

            query.select('document_category document signerCert issuerCert time');

            query.exec(function(err, document) {

                try {
                    if (err) {
                        throw err
                    }

                    if (document == null) {
                        throw 'request_id Invalid'
                    }

                    console.info('document_category: ' + document.document_category)

                    if (document.document_category == 'XML') {

                        console.info('Curl to : ' + process.env.AttachedSig_URL_XML)

                        axios
                            .post(process.env.AttachedSig_URL_XML, {
                                inputFile: document.document,
                                signature: req.body.signature
                            })
                            .then(attached_res => {

                                if (attached_res.data.status == 'SUCCESS') {

                                    console.info('attached signature status: ' + attached_res.data.status)

                                    Document.findOneAndUpdate({ request_id: req.body.request_id }, { $set: { signed_document: attached_res.data.outputFile, flag: 'N' } }, { new: true }, (err, doc) => {

                                        try {
                                            if (err) {
                                                throw err
                                            }

                                            if (doc.signed_document == null) {
                                                throw 'update signed Document to DB Failed'
                                            }

                                            if (doc.flag == null) {
                                                throw 'update flag to DB Failed'
                                            }

                                            response.result = ACCEPT
                                            response.description = 'Signed Document succuss'

                                            console.info(response.description)

                                            res.status(200);
                                            res.send(response);

                                        } catch (updateEx) {
                                            errorResp.status = REJECT
                                            errorResp.description = updateEx

                                            console.error(errorResp.description)

                                            res.status(500);
                                            res.send(errorResp);
                                        }
                                    });

                                } else {
                                    errorResp.status = REJECT
                                    errorResp.description = "{" + attached_res.data.status + "}" + " status from attach Signature: " + attached_res.data.description

                                    console.error(errorResp.description)

                                    res.status(200);
                                    res.send(errorResp);
                                }
                            })
                            .catch(attached_res_error => {

                                errorResp.status = REJECT
                                errorResp.description = "Curl to attach Signature Exception: " + attached_res_error

                                console.error(errorResp.description)

                                res.status(500);
                                res.send(errorResp);
                            })

                    } else if (document.document_category == 'PDF') {

                        console.info('Curl to : ' + process.env.AttachedSig_URL_PDF)

                        axios
                            .post(process.env.AttachedSig_URL_PDF, {
                                signerInfo: req.body.signature,
                                signerCert: document.signerCert,
                                issuerCert: document.issuerCert,
                                inputFile: document.document,
                                timestampRequired: process.env.timestampRequired,
                                timeString: document.time

                            })
                            .then(attached_res => {

                                if (attached_res.data.status == 'SUCCESS') {

                                    console.info('attached signature status: ' + attached_res.data.status)

                                    Document.findOneAndUpdate({ request_id: req.body.request_id }, { $set: { signed_document: attached_res.data.outputFile, flag: 'N' } }, { new: true }, (err, doc) => {

                                        try {
                                            if (err) {
                                                throw err
                                            }

                                            if (doc.signed_document == null) {
                                                throw 'update signed Document to DB Failed'
                                            }

                                            if (doc.flag == null) {
                                                throw 'update flag to DB Failed'
                                            }

                                            response.result = ACCEPT
                                            response.description = 'Signed Document succuss'

                                            console.info(response.description)

                                            res.status(200);
                                            res.send(response);

                                        } catch (updateEx) {
                                            errorResp.status = REJECT
                                            errorResp.description = updateEx

                                            console.error(errorResp.description)

                                            res.status(500);
                                            res.send(errorResp);
                                        }
                                    });

                                } else {
                                    errorResp.status = REJECT
                                    errorResp.description = "{" + attached_res.data.status + "}" + " status from attach Signature: " + attached_res.data.description

                                    console.error(errorResp.description)

                                    res.status(200);
                                    res.send(errorResp);
                                }
                            })
                            .catch(attached_res_error => {

                                errorResp.status = REJECT
                                errorResp.description = "Curl to attach Signature Exception: " + attached_res_error

                                console.error(errorResp.description)

                                res.status(500);
                                res.send(errorResp);
                            })
                    }

                } catch (queryEx) {
                    errorResp.status = REJECT
                    errorResp.description = queryEx

                    console.error(errorResp.description)

                    res.status(500);
                    res.send(errorResp);
                }
            })
        }
    } catch (ex) {

        errorResp.status = REJECT
        errorResp.description = 'Unknown Exception ERROR: ' + ex

        console.error(errorResp.description)

        res.status(500);
        res.send(errorResp);
    }
})

app.post('/api/v2/documents/signed_request', (req, res) => {

    var errorResp = new Object();
    var response = new Object();

    try {

        console.info('********** SIGNED REQUEST **********')

        if (req.body.request_id == null || req.body.request_id == '') {

            errorResp.status = REJECT
            errorResp.description = 'request_id Invalid'

            console.error(errorResp.description)

            res.status(400);
            res.send(errorResp);
        } else {

            console.info('request_id: ' + req.body.request_id)
            var query = Document.findOne({ 'request_id': req.body.request_id });

            query.select('signed_document flag');

            query.exec(function(err, document) {

                try {
                    if (err) {
                        throw err
                    }

                    if (document == null) {
                        throw 'request_id Invalid'
                    }

                    if (document.signed_document == null) {
                        throw 'document is no signed yet'
                    }

                    if (document.flag == 'Y') {
                        throw 'document was recepted'
                    }

                    Document.findOneAndUpdate({ request_id: req.body.request_id }, { $set: { flag: 'Y' } }, { new: true }, (err, doc) => {

                        try {
                            if (err) {
                                throw err
                            }

                            if (doc.flag == null) {
                                throw 'update flag to DB Failed'
                            }

                            response.result = ACCEPT
                            response.description = 'Signed Document succuss'
                            response.signed_document = document.signed_document

                            console.info(response.description)

                            res.status(200);
                            res.send(response);


                        } catch (updateEx) {
                            errorResp.status = REJECT
                            errorResp.description = updateEx

                            console.error(errorResp.description)

                            res.status(500);
                            res.send(errorResp);
                        }
                    });

                } catch (queryEx) {
                    errorResp.status = REJECT
                    errorResp.description = queryEx

                    if (queryEx == 'document is no signed yet') {
                        console.warn(errorResp.description)
                    } else {
                        console.error(errorResp.description)
                    }

                    res.status(500);
                    res.send(errorResp);
                }
            })
        }
    } catch (ex) {

        errorResp.status = REJECT
        errorResp.description = 'Unknown Exception ERROR: ' + ex

        console.error(errorResp.description)

        res.status(500);
        res.send(errorResp);
    }
})

app.listen(9000, () => {
    console.info('Application is running')
})