const express = require('express')
const router = express.Router()

const monk = require('monk')
const path = require("path");
const cookieParser = require("cookie-parser");
const cors = require('cors');
const db = monk('localhost:27017/assignment2');

router.use(express.static('public'))
router.use(express.json())
router.use(express.urlencoded({extended: false}));
router.use(cookieParser());


router.use((request, response, next) => {
    request.db = db;
    next();
})


router.get('/loadpage', (request, response) => {
    const category = request.query.category;
    const searchString = request.query.searchstring;
    const db = request.db;
    const productCollection = db.collection('productCollection');
    productCollection
        .find({
            category: {
                '$regex': category,
                '$options': "i",
            },
            name: {
                '$regex': searchString,
                "$options": "i",
            },
        })
        .then((result) => {
            response.json((result.map((item) => {
                return {
                    _id: item._id,
                    name: item.name,
                    price: item.price,
                    productImage: item.productImage,
                };
            })));
        }, (error) => {
            response.status(500).send(error.message);
        });
});

router.get('/loadproduct/:productid', (request, response) => {
    const productid = request.params.productid;
    const db = request.db;
    const productCollection = db.collection('productCollection');
    productCollection
        .findOne({
            _id: productid,
        })
        .then((product) => {
            if (!product) {
                response.json({});
            }
            response.json({
                manufacturer: product.Manufacturer,
                description: product.description,
            });
        }, (error) => {
            response.status(500).send(error.message);
        })
});

router.post('/signin', (request, response) => {
    const username = request.body.username;
    const password = request.body.password;
    const db = request.db;
    const userCollection = db.collection('userCollection');
    userCollection
        .findOne({
            username: username,
        })
        .then((user) => {
            if (!user || user.password !== password) {
                response.json({
                    succeed: false,
                    message: 'Login failure',
                });
            } else {
                response.cookie('userId', user._id);
                response.json({
                    succeed: true,
                    totalnum: user.totalnum,
                });
            }
        }, (error) => {
            response.status(500).send(error.message);
        });
});

router.get('/signout', (request, response) => {
    response.clearCookie('userId');
    response.send('');
});

router.get('/getsessioninfo', (request, response) => {
    const userId = request.cookies.userId;
    const db = request.db;
    const userCollection = db.collection('userCollection');
    if (userId) {
        userCollection
            .findOne({
                _id: userId,
            })
            .then((user) => {
                if (!user) {
                    response.json({});
                }
                response.json({
                    username: user.username,
                    totalnum: user.totalnum,
                })
            }, (error) => {
                response.status(500).send(error.message);
            });
    } else {
        response.json({});
    }
});

router.put('/addtocart', (request, response) => {
    const userId = request.cookies.userId;
    const db = request.db;
    const userCollection = db.collection('userCollection');
    const productId = request.body.productId;
    const quantity = parseInt(request.body.quantity);
    userCollection
        .findOne({
            _id: userId,
        })
        .then((user) => {
            if (!user) {
                response.status(500).send('User not exist');
            }
            if (user.cart === null) {
                user.cart = [];
            }
            const product = user.cart.find(element => element.productId === productId);
            if (product) {
                product.quantity += quantity;
            } else {
                user.cart.push({
                    productId: productId,
                    quantity: quantity,
                });
            }
            user.totalnum += quantity;
            userCollection.update({_id: userId}, {
                $set: {
                    cart: user.cart,
                    totalnum: user.totalnum,
                },
            }).then((result) => {
                response.json({
                    totalnum: user.totalnum,
                });
            }, (error) => {
                response.status(500).send(error.message);
            })
        }, (error) => {
            response.status(500).send(error.message);
        })
});

router.get('/loadcart', (request, response) => {
    const userId = request.cookies.userId;
    const db = request.db;
    const userCollection = db.collection('userCollection');
    const productCollection = db.collection('productCollection');
    userCollection
        .findOne({
            _id: userId,
        })
        .then((user) => {
            if (!user) {
                response.status(401).send('Please Sign in');
            }
            const result = user.cart.map(async (item) => {
                let result;
                await productCollection
                    .findOne({
                        _id: item.productId,
                    })
                    .then(product => {
                        result = {
                            name: product.name,
                            price: product.price,
                            productImage: product.productImage,
                            quantity: item.quantity,
                            productId: product._id,
                        }
                    });
                return result;
            });
            Promise.all(result).then((result) => {
                response.json({
                    cart: result,
                    totalnum: user.totalnum,
                });
            }, (error) => {
                response.status(500).send(error.message);
            })
        }, error => {
            response.status(500).send(error.message)
        })
});

router.put('/updatecart', (request, response) => {
    const userId = request.cookies.userId;
    const productId = request.body.productId;
    const quantity = request.body.quantity;
    const db = request.db;
    const userCollection = db.collection('userCollection');
    userCollection
        .findOne({
            _id: userId,
        })
        .then((user) => {
            const index = user.cart.findIndex(element => element.productId === productId);
            if (index !== -1) {
                user.totalnum = user.totalnum - user.cart[index].quantity + quantity;
                user.cart[index].quantity = quantity;
            }
            userCollection.update({
                _id: userId,
            }, {
                $set: {
                    cart: user.cart,
                    totalnum: user.totalnum,
                },
            }).then(() => {
                response.json({totalnum: user.totalnum});
            }, error => {
                response.status(500).send(error.message);
            });
        }, (error) => {
            response.status(500).send(error.message);
        })
});

router.delete('/deletefromcart/:productid', (request, response) => {
    const userId = request.cookies.userId;
    const productId = request.params.productid;
    const db = request.db;
    const userCollection = db.collection('userCollection');
    userCollection
        .findOne({
            _id: userId,
        })
        .then((user) => {
            const index = user.cart.findIndex(element => element.productId === productId);
            if (index !== -1) {
                user.totalnum -= user.cart[index].quantity;
                user.cart.splice(index, 1);
            }
            userCollection.update({
                _id: userId,
            }, {
                $set: {
                    cart: user.cart,
                    totalnum: user.totalnum,
                },
            }).then(() => {
                response.json({totalnum: user.totalnum});
            }, error => {
                response.send(error);
            });
        }, (error) => {
            response.send(error);
        })
});

router.get('/checkout', (request, response) => {
    const userId = request.cookies.userId;
    const db = request.db;
    const userCollection = db.collection('userCollection');
    userCollection.update({
        _id: userId,
    }, {
        $set: {
            totalnum: 0,
            cart: [],
        },
    }).then(() => {
        response.send('');
    }, (error) => {
        response.status(500).send(error.message);
    });
});

module.exports = router;